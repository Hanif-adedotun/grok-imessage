import { Hono } from "hono";
import { createReplyHandler } from "./bridge/reply.ts";
import type { TokenStore } from "./bridge/tokens.ts";

export function createHttpApp(store: TokenStore) {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "grok-imessage-bridge",
      phase: "foundation",
    }),
  );

  app.post("/reply", createReplyHandler(store));

  return app;
}
