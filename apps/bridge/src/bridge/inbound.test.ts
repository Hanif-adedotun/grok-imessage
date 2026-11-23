import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import { RecentIdSet } from "./dedup.ts";
import { handleInbound, type InboundDeps, type InboundInput } from "./inbound.ts";
import { RateLimiter } from "./rate-limit.ts";
import { TokenStore } from "./tokens.ts";
import type { WakeDeps, WakePayload, WakeResult } from "./wake.ts";

function makeStore() {
  return new TokenStore({
    pepper: "test",
    ttlMs: 60_000,
    now: () => 1_000_000,
  });
}

type Log = { sent: string[]; replied: string[]; reacted: string[] };

function emptyLog(): Log {
  return { sent: [] as string[], replied: [] as string[], reacted: [] as string[] };
}

function spaceStub(log: Log) {
  return {
    send: async (text: string) => {
      log.sent.push(text);
    },
    responding: async <T>(fn: () => T | Promise<T>) => fn(),
    reply: async (text: string) => {
      log.replied.push(text);
    },
    react: async (emoji: string) => {
      log.reacted.push(emoji);
    },
  };
}

function baseInput(log: Log, overrides: Partial<InboundInput> = {}): InboundInput {
  const s = spaceStub(log);
  return {
    contentType: "text",
    text: "hello",
    from: "+15555550100",
    platform: "imessage",
    isAgent: false,
    space: s as unknown as Space,
    message: s as unknown as Message,
    ...overrides,
  };
}

function deps(
  store: TokenStore,
  overrides: Partial<InboundDeps> & { wakes?: WakePayload[] } = {},
): InboundDeps {
  const wakes = overrides.wakes ?? [];
  const wakeImpl =
    overrides.wake ??
    (async (_d: WakeDeps, payload: WakePayload): Promise<WakeResult> => {
      wakes.push(payload);
      return { ok: true };
    });

  return {
    store,
    wake: wakeImpl,
    fetch: overrides.fetch ?? (async () => new Response(null, { status: 200 })),
    wakeUrl: overrides.wakeUrl ?? "",
    wakeKey: overrides.wakeKey ?? "",
    replyUrl: overrides.replyUrl ?? "https://bridge.example.com/reply",
    allowlist: overrides.allowlist ?? null,
    nowIso: overrides.nowIso ?? (() => "2026-11-07T00:00:00.000Z"),
    uuid: overrides.uuid ?? (() => "uuid-1"),
    rateLimiter: overrides.rateLimiter,
    dedup: overrides.dedup,
    inflight: overrides.inflight,
    log: overrides.log,
    wakeTimeoutMs: overrides.wakeTimeoutMs,
  };
}

describe("handleInbound", () => {
  test("non-text → ignored", async () => {
    const log = emptyLog();
    const result = await handleInbound(
      baseInput(log, { contentType: "attachment", text: "" }),
      deps(makeStore()),
    );
    expect(result).toEqual({ outcome: "ignored", reason: "non_text" });
    expect(log.sent).toEqual([]);
  });

  test("empty / whitespace text → ignored", async () => {
    const log = emptyLog();
    const result = await handleInbound(
      baseInput(log, { text: "  \n\t " }),
      deps(makeStore()),
    );
    expect(result).toEqual({ outcome: "ignored", reason: "empty" });
  });

  test("sender not on allowlist → ignored", async () => {
    const log = emptyLog();
    const result = await handleInbound(
      baseInput(log, { from: "+1999" }),
      deps(makeStore(), { allowlist: new Set(["+15555550100"]) }),
    );
    expect(result).toEqual({ outcome: "ignored", reason: "allowlist" });
  });

  test("empty allowlist allows all", async () => {
    const log = emptyLog();
    const result = await handleInbound(
      baseInput(log),
      deps(makeStore(), { allowlist: null, wakeUrl: "", wakeKey: "" }),
    );
    expect(result).toEqual({ outcome: "echoed" });
    expect(log.replied).toEqual(["echo: hello"]);
  });

  test("agent / own-echo → ignored", async () => {
    const log = emptyLog();
    const result = await handleInbound(
      baseInput(log, { isAgent: true }),
      deps(makeStore()),
    );
    expect(result).toEqual({ outcome: "ignored", reason: "agent" });
  });

  test("wake disabled → echo via reply", async () => {
    const log = emptyLog();
    const result = await handleInbound(baseInput(log), deps(makeStore()));
    expect(result).toEqual({ outcome: "echoed" });
    expect(log.replied).toEqual(["echo: hello"]);
    expect(log.sent).toEqual([]);
  });

  test("wake enabled → mint bind wake react", async () => {
    const log = emptyLog();
    const wakes: WakePayload[] = [];
    const store = makeStore();
    const result = await handleInbound(
      baseInput(log),
      deps(store, {
        wakeUrl: "https://bot.example/hook",
        wakeKey: "secret",
        wakes,
      }),
    );

    expect(result).toEqual({ outcome: "woken", correlationId: "uuid-1" });
    expect(wakes).toHaveLength(1);
    expect(wakes[0]).toEqual({
      text: "hello",
      from: "+15555550100",
      platform: "imessage",
      reply_url: "https://bridge.example.com/reply",
      reply_token: expect.any(String),
      correlation_id: "uuid-1",
      sent_at: "2026-11-07T00:00:00.000Z",
    });
    expect(log.reacted).toEqual(["like"]);
    // token bound and resolvable
    expect(store.resolve(wakes[0]!.reply_token).ok).toBe(true);
  });

  test("wake fails → error send and token unbound", async () => {
    const log = emptyLog();
    const store = makeStore();
    let capturedToken = "";
    const result = await handleInbound(
      baseInput(log),
      deps(store, {
        wakeUrl: "https://bot.example/hook",
        wakeKey: "secret",
        wake: async (_d, payload) => {
          capturedToken = payload.reply_token;
          return { ok: false, reason: "http", status: 500, body: "nope" };
        },
      }),
    );

    expect(result).toEqual({ outcome: "wake_failed" });
    expect(log.sent[0]).toContain("Couldn't reach");
    expect(store.resolve(capturedToken)).toEqual({ ok: false, reason: "invalid" });
    expect(log.reacted).toEqual([]);
  });

  test("duplicate messageId → ignored", async () => {
    const log = emptyLog();
    const dedup = new RecentIdSet({ ttlMs: 60_000, now: () => 1 });
    const d = deps(makeStore(), { dedup });
    const first = await handleInbound(baseInput(log, { messageId: "m-1" }), d);
    expect(first.outcome).toBe("echoed");
    const second = await handleInbound(baseInput(log, { messageId: "m-1" }), d);
    expect(second).toEqual({ outcome: "ignored", reason: "duplicate" });
  });

  test("rate limited → ignored", async () => {
    const log = emptyLog();
    const rateLimiter = new RateLimiter({
      capacity: 1,
      windowMs: 60_000,
      now: () => 1,
    });
    const d = deps(makeStore(), { rateLimiter });
    expect((await handleInbound(baseInput(log), d)).outcome).toBe("echoed");
    expect(await handleInbound(baseInput(log), d)).toEqual({
      outcome: "ignored",
      reason: "rate_limited",
    });
  });

  test("react failure is best-effort after successful wake", async () => {
    const log = emptyLog();
    const s = spaceStub(log);
    const message = {
      ...s,
      react: async () => {
        throw new Error("no tapback");
      },
    };
    const result = await handleInbound(
      {
        ...baseInput(log),
        space: s as unknown as Space,
        message: message as unknown as Message,
      },
      deps(makeStore(), {
        wakeUrl: "https://bot.example/hook",
        wakeKey: "secret",
      }),
    );
    expect(result).toEqual({ outcome: "woken", correlationId: "uuid-1" });
  });
});
