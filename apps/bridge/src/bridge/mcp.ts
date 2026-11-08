import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { deliverReply, type DeliverDeps } from "./deliver.ts";

export type McpMountOptions = DeliverDeps & {
  /** If set, require `Authorization: Bearer <token>` on `/mcp`. */
  authToken?: string | null;
};

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function createServer(deps: DeliverDeps): McpServer {
  const server = new McpServer({
    name: "grok-imessage-bridge",
    version: "0.0.1",
  });

  server.registerTool(
    "send_reply",
    {
      title: "Send iMessage reply",
      description:
        "Deliver a finished Grok Bot reply to the iMessage chat bound to reply_token. Call this when the wake routine is done.",
      inputSchema: {
        text: z.string().describe("Reply text to send over iMessage"),
        reply_token: z
          .string()
          .describe("One-shot token from the wake webhook payload"),
        correlation_id: z
          .string()
          .optional()
          .describe("Optional correlation id from the wake payload"),
      },
    },
    async ({ text, reply_token, correlation_id }) => {
      const result = await deliverReply(deps, {
        token: reply_token,
        text,
        correlationId: correlation_id,
      });

      const payload = result.ok
        ? { ok: true as const, correlation_id: result.correlation_id }
        : { ok: false as const, error: result.error };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: !result.ok,
      };
    },
  );

  return server;
}

/** Mount Streamable HTTP MCP at `/mcp` (stateless JSON mode). */
export function createMcpApp(opts: McpMountOptions): Hono {
  const { authToken, ...deps } = opts;
  const app = new Hono();

  app.all("/mcp", async (c) => {
    if (authToken) {
      const auth = c.req.header("Authorization");
      if (auth !== `Bearer ${authToken}`) {
        return unauthorized();
      }
    }

    const server = createServer(deps);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}

/** Test helper: invoke send_reply without HTTP. */
export async function callSendReplyTool(
  deps: DeliverDeps,
  args: { text: string; reply_token: string; correlation_id?: string },
) {
  return deliverReply(deps, {
    token: args.reply_token,
    text: args.text,
    correlationId: args.correlation_id,
  });
}
