import { describe, expect, test } from "bun:test";
import { createHttpApp } from "./http.ts";

describe("GET /health", () => {
  test("returns ok", async () => {
    const app = createHttpApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("grok-imessage-bridge");
  });
});
