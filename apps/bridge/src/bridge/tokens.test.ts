import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import { TokenStore, type Binding } from "./tokens.ts";

function binding(overrides: Partial<Binding> = {}): Binding {
  return {
    space: { send: async () => undefined } as unknown as Space,
    message: null as Message | null,
    from: "+15555550100",
    correlationId: "corr-1",
    ...overrides,
  };
}

describe("TokenStore.mint", () => {
  test("returns distinct URL-safe tokens", () => {
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 60_000,
      now: () => 1,
    });
    const a = s.mint();
    const b = s.mint();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("TokenStore.resolve + consume", () => {
  test("resolve returns binding without consuming", () => {
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 60_000,
      now: () => 1_000_000,
    });
    const token = s.mint();
    const b = binding({ correlationId: "c-42" });
    s.bind(token, b);

    expect(s.resolve(token)).toEqual({ ok: true, binding: b });
    expect(s.resolve(token)).toEqual({ ok: true, binding: b });
  });

  test("consume marks one-shot; second consume → consumed", () => {
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 60_000,
      now: () => 1_000_000,
    });
    const token = s.mint();
    const b = binding();
    s.bind(token, b);

    expect(s.consume(token)).toEqual({ ok: true, binding: b });
    expect(s.consume(token)).toEqual({ ok: false, reason: "consumed" });
    expect(s.resolve(token)).toEqual({ ok: false, reason: "consumed" });
  });

  test("unknown token → invalid", () => {
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 60_000,
      now: () => 1,
    });
    expect(s.resolve("no-such-token")).toEqual({ ok: false, reason: "invalid" });
  });

  test("expired (fake clock) → expired and entry dropped", () => {
    let now = 1_000_000;
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 1_000,
      now: () => now,
    });
    const token = s.mint();
    s.bind(token, binding());

    now = 1_000_000 + 1_001;
    expect(s.resolve(token)).toEqual({ ok: false, reason: "expired" });
    expect(s.resolve(token)).toEqual({ ok: false, reason: "invalid" });
  });

  test("hash at rest: raw token never stored", () => {
    const records = new Map();
    const s = new TokenStore({
      pepper: "test-pepper",
      ttlMs: 60_000,
      now: () => 1,
      records,
    });
    const token = s.mint();
    s.bind(token, binding());

    const serialized = JSON.stringify([...records.entries()]);
    expect(serialized.includes(token)).toBe(false);
    for (const key of records.keys()) {
      expect(key).not.toBe(token);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test("wrong pepper cannot resolve tokens bound under another pepper", () => {
    const records = new Map();
    const a = new TokenStore({
      pepper: "pepper-a",
      ttlMs: 60_000,
      now: () => 1,
      records,
    });
    const b = new TokenStore({
      pepper: "pepper-b",
      ttlMs: 60_000,
      now: () => 1,
      records,
    });
    const token = a.mint();
    a.bind(token, binding());

    expect(b.resolve(token)).toEqual({ ok: false, reason: "invalid" });
    expect(a.resolve(token).ok).toBe(true);
  });
});
