import { Hono } from "hono";
import { createReplyHandler } from "./bridge/reply.ts";
import type { TokenStore } from "./bridge/tokens.ts";

export type HealthSnapshot = {
  spectrum: boolean;
  wake: boolean;
};

export function createHttpApp(
  store: TokenStore,
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

  app.post("/reply", createReplyHandler(store));

  return app;
}
