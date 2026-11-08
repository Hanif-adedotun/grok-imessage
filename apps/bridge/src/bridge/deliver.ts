import type { InFlightWatch } from "./inflight.ts";
import type { LogFn } from "./log.ts";
import type { TokenStore } from "./tokens.ts";

export type DeliverDeps = {
  store: TokenStore;
  inflight?: InFlightWatch;
  log?: LogFn;
};

export type DeliverReplyInput = {
  token: string;
  text: string;
  correlationId?: string;
};

export type DeliverReplyResult =
  | { ok: true; correlation_id: string }
  | {
      ok: false;
      error: "missing_text" | "invalid" | "expired" | "consumed" | "send_failed";
    };

/** Shared path for HTTP `/reply` and MCP `send_reply`. */
export async function deliverReply(
  deps: DeliverDeps,
  input: DeliverReplyInput,
): Promise<DeliverReplyResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "missing_text" };

  const token = input.token.trim();
  const resolved = deps.store.resolve(token);
  if (!resolved.ok) {
    return { ok: false, error: resolved.reason };
  }

  const correlationId = input.correlationId ?? resolved.binding.correlationId;

  try {
    await resolved.binding.space.send(text);
  } catch {
    deps.log?.("reply.send_failed", { correlation_id: correlationId });
    return { ok: false, error: "send_failed" };
  }

  deps.store.consume(token);
  deps.inflight?.cancel(token);
  deps.log?.("reply.ok", { correlation_id: correlationId });

  return { ok: true, correlation_id: correlationId };
}
