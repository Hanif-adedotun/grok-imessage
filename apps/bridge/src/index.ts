import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { handleInbound } from "./bridge/inbound.ts";
import { TokenStore } from "./bridge/tokens.ts";
import { wakeGrokBot } from "./bridge/wake.ts";
import { createHttpApp } from "./http.ts";

function allowedSenders(): Set<string> | null {
  const raw = process.env.ALLOWED_SENDERS?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function publicReplyUrl(): string {
  const base = process.env.BRIDGE_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("BRIDGE_PUBLIC_BASE_URL is required to build reply_url for Grok Bot");
  }
  return `${base}/reply`;
}

/** Outbound/agent echoes — skip so we do not re-wake on our own sends. */
function isAgentEcho(message: { direction?: string }): boolean {
  return message.direction === "outbound";
}

const store = new TokenStore({
  pepper: process.env.REPLY_TOKEN_PEPPER ?? "dev-only-pepper",
  ttlMs: 45 * 60 * 1000,
  now: () => Date.now(),
});

const port = Number(process.env.PORT ?? 3000);
const http = createHttpApp(store);

Bun.serve({
  port,
  fetch: http.fetch,
});

console.log(`[http] listening on :${port}`);

const projectId = process.env.PROJECT_ID;
const projectSecret = process.env.PROJECT_SECRET;

if (!projectId || !projectSecret) {
  console.warn(
    "[spectrum] PROJECT_ID / PROJECT_SECRET missing — HTTP /health and /reply are up; message loop not started. See .env.example",
  );
} else {
  const wakeUrl = process.env.GROK_BOT_WEBHOOK_URL ?? "";
  const wakeKey = process.env.GROK_BOT_WEBHOOK_KEY ?? "";
  const wakeConfigured = Boolean(wakeUrl.trim() && wakeKey.trim());

  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config(), terminal.config()],
  });

  console.log("[spectrum] connected — waiting for messages");

  const inboundDeps = {
    store,
    wake: wakeGrokBot,
    fetch,
    wakeUrl,
    wakeKey,
    replyUrl: wakeConfigured ? publicReplyUrl() : "http://127.0.0.1/unused",
    allowlist: allowedSenders(),
    nowIso: () => new Date().toISOString(),
    uuid: () => crypto.randomUUID(),
  };

  void (async () => {
    for await (const [space, message] of app.messages) {
      try {
        const contentType = message.content.type;
        await handleInbound(
          {
            contentType,
            text: contentType === "text" ? message.content.text : "",
            from: message.sender?.id ?? "unknown",
            platform: String(message.platform ?? "imessage"),
            isAgent: isAgentEcho(message),
            space,
            message,
          },
          inboundDeps,
        );
      } catch (err) {
        console.error("[inbound] error", err);
      }
    }
  })();
}
