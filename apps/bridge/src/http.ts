import { Hono } from "hono";
import { createMcpApp } from "./bridge/mcp.ts";
import { createReplyHandler, type ReplyHandlerDeps } from "./bridge/reply.ts";
import type { TokenStore } from "./bridge/tokens.ts";

export type HealthSnapshot = {
  spectrum: boolean;
  wake: boolean;
};

export type HttpAppOptions = {
  mcpAuthToken?: string | null;
};

export function createHttpApp(
  storeOrDeps: TokenStore | ReplyHandlerDeps,
  getHealth: () => HealthSnapshot = () => ({ spectrum: false, wake: false }),
  options: HttpAppOptions = {},
) {
  const app = new Hono();

  const deps: ReplyHandlerDeps =
    typeof storeOrDeps === "object" &&
    storeOrDeps !== null &&
    "store" in storeOrDeps
      ? storeOrDeps
      : { store: storeOrDeps };

  app.get("/health", (c) => {
    const health = getHealth();
    return c.json({
      ok: true,
      service: "grok-imessage-bridge",
      spectrum: health.spectrum,
      wake: health.wake,
    });
  });

  app.post("/reply", createReplyHandler(deps));
  app.route("/", createMcpApp({ ...deps, authToken: options.mcpAuthToken }));

  return app;
}
