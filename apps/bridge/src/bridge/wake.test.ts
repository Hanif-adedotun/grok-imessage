import { describe, expect, test } from "bun:test";
import { wakeGrokBot, type WakeFetch, type WakePayload } from "./wake.ts";

const payload: WakePayload = {
  text: "what's on my calendar?",
  from: "+15555550100",
  platform: "imessage",
  reply_url: "https://bridge.example.com/reply",
  reply_token: "tok_abc",
  correlation_id: "corr-1",
  sent_at: "2026-11-07T08:00:00.000Z",
};

describe("wakeGrokBot", () => {
  test("missing url → misconfigured", async () => {
    const result = await wakeGrokBot(
      { fetch: globalThis.fetch, url: "", key: "secret" },
      payload,
    );
    expect(result).toEqual({ ok: false, reason: "misconfigured" });
  });

  test("missing key → misconfigured", async () => {
    const result = await wakeGrokBot(
      { fetch: globalThis.fetch, url: "https://example.com/hook", key: "" },
      payload,
    );
    expect(result).toEqual({ ok: false, reason: "misconfigured" });
  });

  test("happy path: Bearer auth, exact JSON body, 200 → ok", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchMock: WakeFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    };

    const result = await wakeGrokBot(
      { fetch: fetchMock, url: "https://bot.example/hook", key: "whsec" },
      payload,
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://bot.example/hook");
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer whsec");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(payload);
  });

  test("payload includes required wake fields", async () => {
    let body: unknown;
    const fetchMock: WakeFetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    };

    await wakeGrokBot(
      { fetch: fetchMock, url: "https://bot.example/hook", key: "k" },
      payload,
    );

    expect(body).toEqual({
      text: payload.text,
      from: payload.from,
      platform: payload.platform,
      reply_url: payload.reply_url,
      reply_token: payload.reply_token,
      correlation_id: payload.correlation_id,
      sent_at: payload.sent_at,
    });
  });

  test("4xx → ok false with status and body", async () => {
    const fetchMock: WakeFetch = async () =>
      new Response("bad request", { status: 400 });

    const result = await wakeGrokBot(
      { fetch: fetchMock, url: "https://bot.example/hook", key: "k" },
      payload,
    );

    expect(result).toEqual({
      ok: false,
      reason: "http",
      status: 400,
      body: "bad request",
    });
  });

  test("5xx → ok false with status and body", async () => {
    const fetchMock: WakeFetch = async () =>
      new Response("upstream down", { status: 502 });

    const result = await wakeGrokBot(
      { fetch: fetchMock, url: "https://bot.example/hook", key: "k" },
      payload,
    );

    expect(result).toEqual({
      ok: false,
      reason: "http",
      status: 502,
      body: "upstream down",
    });
  });

  test("network throw → ok false, does not throw", async () => {
    const fetchMock: WakeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };

    const result = await wakeGrokBot(
      { fetch: fetchMock, url: "https://bot.example/hook", key: "k" },
      payload,
    );

    expect(result).toEqual({
      ok: false,
      reason: "network",
      body: "ECONNREFUSED",
    });
  });
});
