export type RecentIdSetOptions = {
  ttlMs: number;
  now: () => number;
};

/** Remembers ids for a short TTL (Spectrum at-least-once delivery). */
export class RecentIdSet {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly seenAt = new Map<string, number>();

  constructor(opts: RecentIdSetOptions) {
    this.ttlMs = opts.ttlMs;
    this.now = opts.now;
  }

  /** @returns true if this id was already seen within the TTL. */
  seen(id: string): boolean {
    const t = this.now();
    this.prune(t);
    const prev = this.seenAt.get(id);
    if (prev != null && t - prev < this.ttlMs) return true;
    this.seenAt.set(id, t);
    return false;
  }

  private prune(t: number): void {
    for (const [id, at] of this.seenAt) {
      if (t - at >= this.ttlMs) this.seenAt.delete(id);
    }
  }
}
