import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { bindToken, createReplyToken } from "./bridge/tokens.ts";
import { wakeGrokBot } from "./bridge/wake.ts";
import { createHttpApp } from "./http.ts";

function allowedSenders(): Set<string> | null {
  const raw = process.env.ALLOWED_SENDERS?.trim();
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function publicReplyUrl(): string {
  const base = process.env.BRIDGE_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("BRIDGE_PUBLIC_BASE_URL is required to build reply_url for Grok Bot");
  }
  return `${base}/reply`;
}

const port = Number(process.env.PORT ?? 3000);
const http = createHttpApp();

const server = Bun.serve({
  port,
  fetch: http.fetch,
});

console.log(`[http] listening on :${server.port}`);

const projectId = process.env.PROJECT_ID;
const projectSecret = process.env.PROJECT_SECRET;

if (!projectId || !projectSecret) {
  console.warn(
    "[spectrum] PROJECT_ID / PROJECT_SECRET missing — HTTP /health and /reply are up; message loop not started. See .env.example",
  );
} else {
  const allow = allowedSenders();

  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [
      imessage.config(),
      // Local dry-runs without burning an iMessage line
      terminal.config(),
    ],
  });

  console.log("[spectrum] connected — waiting for messages");

  void (async () => {
    for await (const [space, message] of app.messages) {
      try {
        if (message.content.type !== "text") continue;

        const from = message.sender?.id ?? "unknown";
        if (allow && !allow.has(from)) {
          console.log(`[inbound] ignored sender ${from}`);
          continue;
        }

        const text = message.content.text.trim();
        if (!text) continue;

        // Phase 1 default: echo. Flip to wake once GROK_BOT_* is set and you want the Bot loop.
        const useWake = Boolean(process.env.GROK_BOT_WEBHOOK_URL && process.env.GROK_BOT_WEBHOOK_KEY);

        if (!useWake) {
          await space.responding(async () => {
            await message.reply(`echo: ${text}`);
          });
          continue;
        }

        const replyToken = createReplyToken();
        const correlationId = crypto.randomUUID();
        await bindToken(replyToken, {
          space,
          message,
          from,
          correlationId,
        });

        const wake = await wakeGrokBot({
          text,
          from,
          platform: String(message.platform ?? "imessage"),
          reply_url: publicReplyUrl(),
          reply_token: replyToken,
          correlation_id: correlationId,
          sent_at: new Date().toISOString(),
        });

        if (!wake.ok) {
          console.error("[wake] failed", wake.status, wake.body);
          await space.send("Couldn't reach your Grok Bot just now. Try again in a bit.");
          continue;
        }

        // Instant ack while the Bot works (reply comes later via POST /reply)
        try {
          await message.react("like");
        } catch {
          // tapbacks are best-effort
        }
      } catch (err) {
        console.error("[inbound] error", err);
      }
    }
  })();
}
