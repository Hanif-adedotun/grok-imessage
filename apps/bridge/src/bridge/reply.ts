import type { Context } from "hono";
import { deliverReply, type DeliverDeps } from "./deliver.ts";

type ReplyBody = {
  text?: string;
  correlation_id?: string;
};

export type ReplyHandlerDeps = DeliverDeps;

export function createReplyHandler(deps: ReplyHandlerDeps | DeliverDeps["store"]) {
  const deliverDeps: DeliverDeps =
    typeof deps === "object" && deps !== null && "store" in deps
      ? deps
      : { store: deps };

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

    const result = await deliverReply(deliverDeps, {
      token,
      text: body.text ?? "",
      correlationId: body.correlation_id,
    });

    if (!result.ok) {
      const status =
        result.error === "consumed"
          ? 410
          : result.error === "send_failed"
            ? 502
            : result.error === "missing_text"
              ? 400
              : 403;
      return c.json({ ok: false, error: result.error }, status);
    }

    return c.json({
      ok: true,
      correlation_id: result.correlation_id,
    });
  };
}
