export type RateLimiterOptions = {
  capacity: number;
  windowMs: number;
  now: () => number;
};

/** Fixed-window counter per key (sender id). */
export class RateLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.windowMs = opts.windowMs;
    this.now = opts.now;
  }

  allow(key: string): boolean {
    const t = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || t - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { windowStart: t, count: 1 });
      return true;
    }
    if (bucket.count >= this.capacity) return false;
    bucket.count += 1;
    return true;
  }
}
