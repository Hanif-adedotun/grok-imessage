import { describe, expect, test } from "bun:test";
import { TokenStore } from "./bridge/tokens.ts";
import { createHttpApp } from "./http.ts";

function testStore() {
  return new TokenStore({
    pepper: "test",
    ttlMs: 60_000,
    now: () => Date.now(),
  });
}

describe("GET /health", () => {
  test("returns ok", async () => {
    const app = createHttpApp(testStore());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("grok-imessage-bridge");
  });
});
