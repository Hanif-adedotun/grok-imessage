import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import { createHttpApp } from "../http.ts";
import { TokenStore, type Binding } from "./tokens.ts";

function makeStore(now = () => 1_000_000) {
  return new TokenStore({
    pepper: "test-pepper",
    ttlMs: 60_000,
    now,
  });
}

function bindWithSend(
  store: TokenStore,
  send: (text: string) => Promise<unknown>,
  correlationId = "corr-bound",
): string {
  const token = store.mint();
  const binding: Binding = {
    space: { send: (content: unknown) => send(String(content)) } as unknown as Space,
    message: null as Message | null,
    from: "+15555550100",
    correlationId,
  };
  store.bind(token, binding);
  return token;
}

async function postReply(
  app: ReturnType<typeof createHttpApp>,
  opts: {
    token?: string | null;
    body?: string | object;
    authorization?: string | null;
  },
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.authorization === undefined && opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  } else if (opts.authorization) {
    headers.Authorization = opts.authorization;
  } else if (opts.authorization === null) {
    // omit
  }

  const body =
    typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? { text: "hello" });

  return app.request("/reply", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /reply", () => {
  test("missing Authorization → 401", async () => {
    const app = createHttpApp(makeStore());
    const res = await postReply(app, { authorization: null, body: { text: "hi" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "missing_bearer" });
  });

  test("invalid Authorization → 401", async () => {
    const app = createHttpApp(makeStore());
    const res = await postReply(app, {
      authorization: "Token abc",
      body: { text: "hi" },
    });
    expect(res.status).toBe(401);
  });

  test("empty Bearer → 401", async () => {
    const app = createHttpApp(makeStore());
    const res = await postReply(app, {
      authorization: "Bearer ",
      body: { text: "hi" },
    });
    expect(res.status).toBe(401);
  });

  test("invalid JSON → 400", async () => {
    const store = makeStore();
    const token = bindWithSend(store, async () => undefined);
    const app = createHttpApp(store);
    const res = await postReply(app, { token, body: "{not-json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_json" });
  });

  test("empty text → 400", async () => {
    const store = makeStore();
    const token = bindWithSend(store, async () => undefined);
    const app = createHttpApp(store);
    const res = await postReply(app, { token, body: { text: "   " } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "missing_text" });
  });

  test("bad token → 403 invalid", async () => {
    const app = createHttpApp(makeStore());
    const res = await postReply(app, { token: "nope", body: { text: "hi" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "invalid" });
  });

  test("expired token → 403 expired", async () => {
    let now = 1_000_000;
    const store = makeStore(() => now);
    const token = bindWithSend(store, async () => undefined);
    now = 1_000_000 + 60_001;
    const app = createHttpApp(store);
    const res = await postReply(app, { token, body: { text: "hi" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "expired" });
  });

  test("happy path → 200, space.send once, correlation from binding", async () => {
    const sends: string[] = [];
    const store = makeStore();
    const token = bindWithSend(store, async (text) => {
      sends.push(text);
    });
    const app = createHttpApp(store);

    const res = await postReply(app, { token, body: { text: "  done  " } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, correlation_id: "corr-bound" });
    expect(sends).toEqual(["done"]);
  });

  test("correlation_id from body wins", async () => {
    const store = makeStore();
    const token = bindWithSend(store, async () => undefined);
    const app = createHttpApp(store);

    const res = await postReply(app, {
      token,
      body: { text: "hi", correlation_id: "from-body" },
    });
    expect(await res.json()).toEqual({ ok: true, correlation_id: "from-body" });
  });

  test("duplicate after success → 410 consumed", async () => {
    const store = makeStore();
    const token = bindWithSend(store, async () => undefined);
    const app = createHttpApp(store);

    expect((await postReply(app, { token, body: { text: "hi" } })).status).toBe(200);
    const res = await postReply(app, { token, body: { text: "again" } });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ ok: false, error: "consumed" });
  });

  test("send throws → 502 and token still usable", async () => {
    let attempts = 0;
    const store = makeStore();
    const token = bindWithSend(store, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("send failed");
      return undefined;
    });
    const app = createHttpApp(store);

    const fail = await postReply(app, { token, body: { text: "hi" } });
    expect(fail.status).toBe(502);
    expect(await fail.json()).toEqual({ ok: false, error: "send_failed" });

    const retry = await postReply(app, { token, body: { text: "hi" } });
    expect(retry.status).toBe(200);
    expect(attempts).toBe(2);
  });
});
