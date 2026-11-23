import { createHash } from "node:crypto";
import type { Message, Space } from "spectrum-ts";

export type Binding = {
  space: Space;
  message: Message | null;
  from: string;
  correlationId: string;
};

export type TokenLookupResult =
  | { ok: true; binding: Binding }
  | { ok: false; reason: "invalid" | "expired" | "consumed" };

type TokenRecord = {
  tokenHash: string;
  binding: Binding;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export type TokenStoreOptions = {
  pepper: string;
  ttlMs: number;
  now: () => number;
  /** Injectable for tests (shared map / inspection). */
  records?: Map<string, TokenRecord>;
};

export class TokenStore {
  private readonly pepper: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly records: Map<string, TokenRecord>;

  constructor(opts: TokenStoreOptions) {
    this.pepper = opts.pepper;
    this.ttlMs = opts.ttlMs;
    this.now = opts.now;
    this.records = opts.records ?? new Map();
  }

  mint(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Buffer.from(bytes).toString("base64url");
  }

  bind(token: string, binding: Binding): void {
    const tokenHash = this.hash(token);
    const createdAt = this.now();
    this.records.set(tokenHash, {
      tokenHash,
      binding,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      consumedAt: null,
    });
  }

  /** Validate and return binding without marking consumed. */
  resolve(token: string): TokenLookupResult {
    return this.lookup(token, false);
  }

  /** Mark a previously resolved token as consumed (one-shot). */
  consume(token: string): TokenLookupResult {
    return this.lookup(token, true);
  }

  /** Drop a bound token (e.g. wake failed before reply). */
  unbind(token: string): void {
    this.records.delete(this.hash(token));
  }

  private lookup(token: string, markConsumed: boolean): TokenLookupResult {
    const tokenHash = this.hash(token);
    const record = this.records.get(tokenHash);
    if (!record) return { ok: false, reason: "invalid" };
    if (record.consumedAt != null) return { ok: false, reason: "consumed" };
    if (this.now() > record.expiresAt) {
      this.records.delete(tokenHash);
      return { ok: false, reason: "expired" };
    }
    if (markConsumed) {
      record.consumedAt = this.now();
    }
    return { ok: true, binding: record.binding };
  }

  private hash(token: string): string {
    return createHash("sha256").update(`${this.pepper}:${token}`).digest("hex");
  }
}
