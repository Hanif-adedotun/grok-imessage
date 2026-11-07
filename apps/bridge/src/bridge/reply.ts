import type { Context } from "hono";
import type { TokenStore } from "./tokens.ts";

type ReplyBody = {
  text?: string;
  correlation_id?: string;
};

export function createReplyHandler(store: TokenStore) {
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

    const result = store.consume(token);
    if (!result.ok) {
      const status = result.reason === "consumed" ? 410 : 403;
      return c.json({ ok: false, error: result.reason }, status);
    }

    await result.binding.space.send(text);
    return c.json({
      ok: true,
      correlation_id: body.correlation_id ?? result.binding.correlationId,
    });
  };
}
