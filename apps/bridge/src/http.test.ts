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
  test("returns ok with spectrum/wake flags", async () => {
    const app = createHttpApp(testStore(), () => ({
      spectrum: true,
      wake: false,
    }));
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      spectrum: boolean;
      wake: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("grok-imessage-bridge");
    expect(body.spectrum).toBe(true);
    expect(body.wake).toBe(false);
  });
});
