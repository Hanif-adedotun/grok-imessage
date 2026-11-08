import { describe, expect, test } from "bun:test";
import { RecentIdSet } from "./dedup.ts";

describe("RecentIdSet", () => {
  test("sees first id, rejects duplicate until TTL elapses", () => {
    let now = 0;
    const set = new RecentIdSet({ ttlMs: 100, now: () => now });

    expect(set.seen("m1")).toBe(false);
    expect(set.seen("m1")).toBe(true);
    expect(set.seen("m2")).toBe(false);

    now = 101;
    expect(set.seen("m1")).toBe(false);
  });
});
