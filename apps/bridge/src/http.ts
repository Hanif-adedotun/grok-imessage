import { Hono } from "hono";
import { createReplyHandler, type ReplyHandlerDeps } from "./bridge/reply.ts";
import type { TokenStore } from "./bridge/tokens.ts";

export type HealthSnapshot = {
  spectrum: boolean;
  wake: boolean;
};

export function createHttpApp(
  storeOrDeps: TokenStore | ReplyHandlerDeps,
  getHealth: () => HealthSnapshot = () => ({ spectrum: false, wake: false }),
) {
  const app = new Hono();

  app.get("/health", (c) => {
    const health = getHealth();
    return c.json({
      ok: true,
      service: "grok-imessage-bridge",
      spectrum: health.spectrum,
      wake: health.wake,
    });
  });

  app.post("/reply", createReplyHandler(storeOrDeps));

  return app;
}
