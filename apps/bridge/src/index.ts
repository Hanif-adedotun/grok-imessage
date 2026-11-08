import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { RecentIdSet } from "./bridge/dedup.ts";
import {
  loadBridgeEnv,
  replyUrl,
  spectrumConfigured,
  validateBridgeEnv,
  wakeConfigured,
} from "./bridge/env.ts";
import { handleInbound } from "./bridge/inbound.ts";
import { InFlightWatch } from "./bridge/inflight.ts";
import { consoleLog } from "./bridge/log.ts";
import { RateLimiter } from "./bridge/rate-limit.ts";
import { TokenStore } from "./bridge/tokens.ts";
import { wakeGrokBot } from "./bridge/wake.ts";
import { createHttpApp, type HealthSnapshot } from "./http.ts";

/** Outbound/agent echoes — skip so we do not re-wake on our own sends. */
function isAgentEcho(message: { direction?: string }): boolean {
  return message.direction === "outbound";
}

const env = loadBridgeEnv(process.env);
const issues = validateBridgeEnv(env);
for (const issue of issues) {
  console.error(`[env] ${issue.field}: ${issue.message}`);
}
if (issues.length > 0) {
  console.error("[env] fix the issues above, then restart");
  process.exit(1);
}

const store = new TokenStore({
  pepper: env.pepper,
  ttlMs: env.ttlMs,
  now: () => Date.now(),
});

const rateLimiter = new RateLimiter({
  capacity: 20,
  windowMs: 60_000,
  now: () => Date.now(),
});

const dedup = new RecentIdSet({
  ttlMs: 120_000,
  now: () => Date.now(),
});

const inflight = new InFlightWatch({
  store,
  delayMs: 120_000,
});

const health: HealthSnapshot = {
  spectrum: false,
  wake: wakeConfigured(env),
};

const http = createHttpApp(
  { store, inflight, log: consoleLog },
  () => health,
);

Bun.serve({
  port: env.port,
  fetch: http.fetch,
});

console.log(`[http] listening on :${env.port}`);
console.log(
  `[health] spectrum=${health.spectrum} wake=${health.wake} (GET /health)`,
);

if (!spectrumConfigured(env)) {
  console.warn(
    "[spectrum] PROJECT_ID / PROJECT_SECRET missing — HTTP /health and /reply are up; message loop not started. See .env.example",
  );
} else {
  const app = await Spectrum({
    projectId: env.projectId!,
    projectSecret: env.projectSecret!,
    providers: [imessage.config(), terminal.config()],
  });

  health.spectrum = true;
  console.log("[spectrum] connected — waiting for messages");

  const inboundDeps = {
    store,
    wake: wakeGrokBot,
    fetch,
    wakeUrl: env.wakeUrl,
    wakeKey: env.wakeKey,
    replyUrl: wakeConfigured(env) ? replyUrl(env) : "http://127.0.0.1/unused",
    allowlist: env.allowlist,
    nowIso: () => new Date().toISOString(),
    uuid: () => crypto.randomUUID(),
    rateLimiter,
    dedup,
    inflight,
    log: consoleLog,
    wakeTimeoutMs: 15_000,
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
            messageId: message.id,
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
