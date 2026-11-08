import { describe, expect, test } from "bun:test";
import { InFlightWatch } from "./inflight.ts";
import { TokenStore } from "./tokens.ts";
import type { Message, Space } from "spectrum-ts";

describe("InFlightWatch", () => {
  test("pings when token still open after delay; cancel skips ping", async () => {
    const store = new TokenStore({
      pepper: "p",
      ttlMs: 60_000,
      now: () => 1,
    });
    const sent: string[] = [];
    const space = {
      send: async (text: string) => {
        sent.push(text);
      },
    } as unknown as Space;

    const timers: Array<{ ms: number; fn: () => void }> = [];
    const watch = new InFlightWatch({
      store,
      delayMs: 50,
      schedule: (fn, ms) => {
        timers.push({ ms, fn });
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clear: () => {},
    });

    const token = store.mint();
    store.bind(token, {
      space,
      message: null as Message | null,
      from: "+1",
      correlationId: "c1",
    });

    watch.arm(token, space);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(50);

    timers[0]!.fn();
    expect(sent[0]).toContain("Still waiting");

    sent.length = 0;
    const token2 = store.mint();
    store.bind(token2, {
      space,
      message: null,
      from: "+1",
      correlationId: "c2",
    });
    watch.arm(token2, space);
    watch.cancel(token2);
    timers[1]!.fn();
    expect(sent).toEqual([]);
  });

  test("no ping if token already consumed", () => {
    const store = new TokenStore({
      pepper: "p",
      ttlMs: 60_000,
      now: () => 1,
    });
    const sent: string[] = [];
    const space = {
      send: async (text: string) => {
        sent.push(text);
      },
    } as unknown as Space;

    let fire: (() => void) | undefined;
    const watch = new InFlightWatch({
      store,
      delayMs: 10,
      schedule: (fn) => {
        fire = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clear: () => {},
    });

    const token = store.mint();
    store.bind(token, {
      space,
      message: null,
      from: "+1",
      correlationId: "c1",
    });
    watch.arm(token, space);
    store.consume(token);
    fire!();
    expect(sent).toEqual([]);
  });
});
