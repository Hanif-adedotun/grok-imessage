import type { Message, Space } from "spectrum-ts";

export type BoundSpace = {
  /** Spectrum Space kept in-process for v1. */
  space: Space;
  message: Message | null;
  from: string;
  correlationId: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

type TokenRecord = BoundSpace & {
  tokenHash: string;
};

const tokens = new Map<string, TokenRecord>();

function pepper(): string {
  return process.env.REPLY_TOKEN_PEPPER ?? "dev-only-pepper";
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper()}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("hex");
}

export function createReplyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function bindToken(
  token: string,
  binding: Omit<BoundSpace, "createdAt" | "expiresAt" | "consumedAt">,
  ttlMs = 45 * 60 * 1000,
): Promise<void> {
  const now = Date.now();
  const tokenHash = await hashToken(token);
  tokens.set(tokenHash, {
    ...binding,
    tokenHash,
    createdAt: now,
    expiresAt: now + ttlMs,
    consumedAt: null,
  });
}

export async function consumeToken(
  token: string,
): Promise<{ ok: true; binding: BoundSpace } | { ok: false; reason: "invalid" | "expired" | "consumed" }> {
  const tokenHash = await hashToken(token);
  const record = tokens.get(tokenHash);
  if (!record) return { ok: false, reason: "invalid" };
  if (record.consumedAt != null) return { ok: false, reason: "consumed" };
  if (Date.now() > record.expiresAt) {
    tokens.delete(tokenHash);
    return { ok: false, reason: "expired" };
  }
  record.consumedAt = Date.now();
  return { ok: true, binding: record };
}
