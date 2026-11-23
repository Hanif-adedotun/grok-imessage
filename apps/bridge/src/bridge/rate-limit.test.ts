import { describe, expect, test } from "bun:test";
import { RateLimiter } from "./rate-limit.ts";

describe("RateLimiter", () => {
  test("allows up to capacity then rejects until window advances", () => {
    let now = 1_000;
    const limiter = new RateLimiter({
      capacity: 2,
      windowMs: 1_000,
      now: () => now,
    });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);

    now = 2_001;
    expect(limiter.allow("a")).toBe(true);
  });
});
