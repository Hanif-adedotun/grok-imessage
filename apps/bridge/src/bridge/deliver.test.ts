import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import { deliverReply } from "./deliver.ts";
import { TokenStore, type Binding } from "./tokens.ts";

function store() {
  return new TokenStore({
    pepper: "test",
    ttlMs: 60_000,
    now: () => 1_000_000,
  });
}

function bind(
  s: TokenStore,
  send: (text: string) => Promise<unknown>,
): string {
  const token = s.mint();
  const binding: Binding = {
    space: { send: (c: unknown) => send(String(c)) } as unknown as Space,
    message: null as Message | null,
    from: "+1",
    correlationId: "corr-1",
  };
  s.bind(token, binding);
  return token;
}

describe("deliverReply", () => {
  test("happy path", async () => {
    const s = store();
    const sent: string[] = [];
    const token = bind(s, async (t) => {
      sent.push(t);
    });

    const result = await deliverReply({ store: s }, { token, text: "  hi  " });
    expect(result).toEqual({ ok: true, correlation_id: "corr-1" });
    expect(sent).toEqual(["hi"]);
    expect(s.resolve(token)).toEqual({ ok: false, reason: "consumed" });
  });

  test("missing text", async () => {
    const s = store();
    const token = bind(s, async () => {});
    expect(await deliverReply({ store: s }, { token, text: "  " })).toEqual({
      ok: false,
      error: "missing_text",
    });
  });

  test("invalid token", async () => {
    const s = store();
    expect(await deliverReply({ store: s }, { token: "nope", text: "x" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  test("send failure leaves token usable", async () => {
    const s = store();
    let n = 0;
    const token = bind(s, async () => {
      n += 1;
      if (n === 1) throw new Error("fail");
    });

    expect(await deliverReply({ store: s }, { token, text: "x" })).toEqual({
      ok: false,
      error: "send_failed",
    });
    expect(await deliverReply({ store: s }, { token, text: "x" })).toEqual({
      ok: true,
      correlation_id: "corr-1",
    });
  });
});
