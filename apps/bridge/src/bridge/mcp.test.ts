import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import { createHttpApp } from "../http.ts";
import { callSendReplyTool } from "./mcp.ts";
import { TokenStore, type Binding } from "./tokens.ts";

function makeStore() {
  return new TokenStore({
    pepper: "test-pepper",
    ttlMs: 60_000,
    now: () => 1_000_000,
  });
}

function bindWithSend(
  store: TokenStore,
  send: (text: string) => Promise<unknown>,
): string {
  const token = store.mint();
  const binding: Binding = {
    space: { send: (c: unknown) => send(String(c)) } as unknown as Space,
    message: null as Message | null,
    from: "+1",
    correlationId: "corr-mcp",
  };
  store.bind(token, binding);
  return token;
}

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function mcpPost(
  app: ReturnType<typeof createHttpApp>,
  body: unknown,
  auth?: string | null,
) {
  const headers: Record<string, string> = { ...MCP_HEADERS };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("callSendReplyTool", () => {
  test("delegates to deliverReply", async () => {
    const store = makeStore();
    const sent: string[] = [];
    const token = bindWithSend(store, async (t) => {
      sent.push(t);
    });

    const result = await callSendReplyTool(
      { store },
      { text: "via tool", reply_token: token },
    );
    expect(result).toEqual({ ok: true, correlation_id: "corr-mcp" });
    expect(sent).toEqual(["via tool"]);
  });
});

describe("POST /mcp", () => {
  test("optional auth rejects missing bearer", async () => {
    const app = createHttpApp(makeStore(), undefined, {
      mcpAuthToken: "secret",
    });
    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(res.status).toBe(401);
  });

  test("initialize succeeds", async () => {
    const app = createHttpApp(makeStore());
    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { serverInfo?: { name: string } };
    };
    expect(json.result?.serverInfo?.name).toBe("grok-imessage-bridge");
  });

  test("tools/list includes send_reply", async () => {
    const app = createHttpApp(makeStore());
    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = (json.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("send_reply");
  });

  test("tools/call send_reply delivers and consumes token", async () => {
    const store = makeStore();
    const sent: string[] = [];
    const token = bindWithSend(store, async (t) => {
      sent.push(t);
    });
    const app = createHttpApp(store);

    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "send_reply",
        arguments: { text: "mcp hi", reply_token: token },
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: {
        isError?: boolean;
        structuredContent?: { ok: boolean; correlation_id?: string };
      };
    };
    expect(json.result?.isError).toBeFalsy();
    expect(json.result?.structuredContent).toEqual({
      ok: true,
      correlation_id: "corr-mcp",
    });
    expect(sent).toEqual(["mcp hi"]);
    expect(store.resolve(token)).toEqual({ ok: false, reason: "consumed" });
  });

  test("tools/call send_reply bad token → isError", async () => {
    const app = createHttpApp(makeStore());
    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "send_reply",
        arguments: { text: "x", reply_token: "nope" },
      },
    });
    const json = (await res.json()) as {
      result?: {
        isError?: boolean;
        structuredContent?: { ok: boolean; error?: string };
      };
    };
    expect(json.result?.isError).toBe(true);
    expect(json.result?.structuredContent).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  test("auth token accepted when configured", async () => {
    const app = createHttpApp(makeStore(), undefined, {
      mcpAuthToken: "secret",
    });
    const res = await mcpPost(
      app,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      },
      "secret",
    );
    expect(res.status).toBe(200);
  });
});
