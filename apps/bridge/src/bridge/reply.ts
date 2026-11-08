import type { Context } from "hono";
import type { InFlightWatch } from "./inflight.ts";
import type { LogFn } from "./log.ts";
import type { TokenStore } from "./tokens.ts";

type ReplyBody = {
  text?: string;
  correlation_id?: string;
};

export type ReplyHandlerDeps = {
  store: TokenStore;
  inflight?: InFlightWatch;
  log?: LogFn;
};

export function createReplyHandler(deps: ReplyHandlerDeps | TokenStore) {
  const store = "store" in deps ? deps.store : deps;
  const inflight = "store" in deps ? deps.inflight : undefined;
  const log = "store" in deps ? deps.log : undefined;

  return async (c: Context) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ ok: false, error: "missing_bearer" }, 401);
    }

    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      return c.json({ ok: false, error: "missing_bearer" }, 401);
    }

    let body: ReplyBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }

    const text = body.text?.trim();
    if (!text) {
      return c.json({ ok: false, error: "missing_text" }, 400);
    }

    const resolved = store.resolve(token);
    if (!resolved.ok) {
      const status = resolved.reason === "consumed" ? 410 : 403;
      return c.json({ ok: false, error: resolved.reason }, status);
    }

    const correlationId = body.correlation_id ?? resolved.binding.correlationId;

    try {
      await resolved.binding.space.send(text);
    } catch {
      log?.("reply.send_failed", { correlation_id: correlationId });
      return c.json({ ok: false, error: "send_failed" }, 502);
    }

    store.consume(token);
    inflight?.cancel(token);
    log?.("reply.ok", { correlation_id: correlationId });

    return c.json({
      ok: true,
      correlation_id: correlationId,
    });
  };
}
