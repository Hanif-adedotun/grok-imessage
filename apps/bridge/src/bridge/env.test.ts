import { describe, expect, test } from "bun:test";
import {
  loadBridgeEnv,
  validateBridgeEnv,
  wakeConfigured,
  type RawEnv,
} from "./env.ts";

function raw(overrides: RawEnv = {}): RawEnv {
  return { ...overrides };
}

describe("loadBridgeEnv", () => {
  test("defaults port, pepper, empty wake", () => {
    const env = loadBridgeEnv(raw());
    expect(env.port).toBe(3000);
    expect(env.pepper).toBe("dev-only-pepper");
    expect(env.projectId).toBeNull();
    expect(env.projectSecret).toBeNull();
    expect(env.wakeUrl).toBe("");
    expect(env.wakeKey).toBe("");
    expect(env.replyBaseUrl).toBeNull();
    expect(env.allowlist).toBeNull();
    expect(env.mcpAuthToken).toBeNull();
  });

  test("parses allowlist and trims", () => {
    const env = loadBridgeEnv(
      raw({
        ALLOWED_SENDERS: " +1a , +1b, ",
        PORT: "4000",
        PROJECT_ID: " pid ",
        PROJECT_SECRET: " secret ",
        GROK_BOT_WEBHOOK_URL: " https://hook ",
        GROK_BOT_WEBHOOK_KEY: " key ",
        BRIDGE_PUBLIC_BASE_URL: " https://bridge.example.com/ ",
        REPLY_TOKEN_PEPPER: "pep",
        MCP_AUTH_TOKEN: " mcp-secret ",
      }),
    );
    expect(env.port).toBe(4000);
    expect(env.projectId).toBe("pid");
    expect(env.projectSecret).toBe("secret");
    expect(env.wakeUrl).toBe("https://hook");
    expect(env.wakeKey).toBe("key");
    expect(env.replyBaseUrl).toBe("https://bridge.example.com");
    expect(env.pepper).toBe("pep");
    expect(env.mcpAuthToken).toBe("mcp-secret");
    expect([...env.allowlist!]).toEqual(["+1a", "+1b"]);
  });
});

describe("validateBridgeEnv", () => {
  test("ok when nothing configured", () => {
    expect(validateBridgeEnv(loadBridgeEnv(raw()))).toEqual([]);
  });

  test("spectrum requires both id and secret", () => {
    const issues = validateBridgeEnv(
      loadBridgeEnv(raw({ PROJECT_ID: "only-id" })),
    );
    expect(issues.map((i) => i.field)).toContain("PROJECT_SECRET");
  });

  test("wake requires both url and key", () => {
    const issues = validateBridgeEnv(
      loadBridgeEnv(raw({ GROK_BOT_WEBHOOK_URL: "https://hook" })),
    );
    expect(issues.some((i) => i.field === "GROK_BOT_WEBHOOK_KEY")).toBe(true);
  });

  test("wake requires public base url", () => {
    const issues = validateBridgeEnv(
      loadBridgeEnv(
        raw({
          GROK_BOT_WEBHOOK_URL: "https://hook",
          GROK_BOT_WEBHOOK_KEY: "k",
        }),
      ),
    );
    expect(issues.some((i) => i.field === "BRIDGE_PUBLIC_BASE_URL")).toBe(true);
  });

  test("wake fully configured → no issues", () => {
    const issues = validateBridgeEnv(
      loadBridgeEnv(
        raw({
          GROK_BOT_WEBHOOK_URL: "https://hook",
          GROK_BOT_WEBHOOK_KEY: "k",
          BRIDGE_PUBLIC_BASE_URL: "https://bridge.example.com",
        }),
      ),
    );
    expect(issues).toEqual([]);
    expect(
      wakeConfigured(
        loadBridgeEnv(
          raw({
            GROK_BOT_WEBHOOK_URL: "https://hook",
            GROK_BOT_WEBHOOK_KEY: "k",
            BRIDGE_PUBLIC_BASE_URL: "https://bridge.example.com",
          }),
        ),
      ),
    ).toBe(true);
  });
});
