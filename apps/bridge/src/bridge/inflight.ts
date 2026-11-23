import type { Space } from "spectrum-ts";
import type { TokenStore } from "./tokens.ts";

export type InFlightWatchOptions = {
  store: TokenStore;
  delayMs: number;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear?: (id: ReturnType<typeof setTimeout>) => void;
  message?: string;
};

/** After wake, optionally nudge the user if `/reply` never arrives. */
export class InFlightWatch {
  private readonly store: TokenStore;
  private readonly delayMs: number;
  private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clear: (id: ReturnType<typeof setTimeout>) => void;
  private readonly message: string;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(opts: InFlightWatchOptions) {
    this.store = opts.store;
    this.delayMs = opts.delayMs;
    this.schedule = opts.schedule ?? setTimeout;
    this.clear = opts.clear ?? clearTimeout;
    this.message =
      opts.message ?? "Still waiting on your Grok Bot — I'll text when it's done.";
  }

  arm(token: string, space: Space): void {
    this.cancel(token);
    const id = this.schedule(() => {
      if (!this.timers.has(token)) return;
      this.timers.delete(token);
      const resolved = this.store.resolve(token);
      if (!resolved.ok) return;
      void space.send(this.message);
    }, this.delayMs);
    this.timers.set(token, id);
  }

  cancel(token: string): void {
    const id = this.timers.get(token);
    if (id == null) return;
    this.clear(id);
    this.timers.delete(token);
  }
}
