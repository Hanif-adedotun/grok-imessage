import { Hono } from "hono";
import { handleReply } from "./bridge/reply.ts";

export function createHttpApp() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "grok-imessage-bridge",
      phase: "foundation",
    }),
  );

  app.post("/reply", handleReply);

  return app;
}
