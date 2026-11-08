export type RawEnv = Record<string, string | undefined>;

export type BridgeEnv = {
  port: number;
  projectId: string | null;
  projectSecret: string | null;
  wakeUrl: string;
  wakeKey: string;
  replyBaseUrl: string | null;
  allowlist: Set<string> | null;
  pepper: string;
  ttlMs: number;
};

export type EnvIssue = {
  field: string;
  message: string;
};

function trimOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim() ?? "";
  return v ? v : null;
}

export function loadBridgeEnv(raw: RawEnv): BridgeEnv {
  const allowRaw = trimOrEmpty(raw.ALLOWED_SENDERS);
  const allowlist = allowRaw
    ? new Set(
        allowRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  const port = Number(raw.PORT ?? 3000);

  return {
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    projectId: trimOrNull(raw.PROJECT_ID),
    projectSecret: trimOrNull(raw.PROJECT_SECRET),
    wakeUrl: trimOrEmpty(raw.GROK_BOT_WEBHOOK_URL),
    wakeKey: trimOrEmpty(raw.GROK_BOT_WEBHOOK_KEY),
    replyBaseUrl: trimOrNull(raw.BRIDGE_PUBLIC_BASE_URL)?.replace(/\/$/, "") ?? null,
    allowlist,
    pepper: trimOrNull(raw.REPLY_TOKEN_PEPPER) ?? "dev-only-pepper",
    ttlMs: 45 * 60 * 1000,
  };
}

export function spectrumConfigured(env: BridgeEnv): boolean {
  return Boolean(env.projectId && env.projectSecret);
}

export function wakeConfigured(env: BridgeEnv): boolean {
  return Boolean(env.wakeUrl && env.wakeKey && env.replyBaseUrl);
}

export function replyUrl(env: BridgeEnv): string {
  if (!env.replyBaseUrl) {
    throw new Error("BRIDGE_PUBLIC_BASE_URL is required to build reply_url");
  }
  return `${env.replyBaseUrl}/reply`;
}

/** Structural checks — call at startup and log/fail before opening Spectrum. */
export function validateBridgeEnv(env: BridgeEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];

  if (env.projectId && !env.projectSecret) {
    issues.push({
      field: "PROJECT_SECRET",
      message: "PROJECT_ID is set but PROJECT_SECRET is missing",
    });
  }
  if (env.projectSecret && !env.projectId) {
    issues.push({
      field: "PROJECT_ID",
      message: "PROJECT_SECRET is set but PROJECT_ID is missing",
    });
  }

  if (env.wakeUrl && !env.wakeKey) {
    issues.push({
      field: "GROK_BOT_WEBHOOK_KEY",
      message: "GROK_BOT_WEBHOOK_URL is set but GROK_BOT_WEBHOOK_KEY is missing",
    });
  }
  if (env.wakeKey && !env.wakeUrl) {
    issues.push({
      field: "GROK_BOT_WEBHOOK_URL",
      message: "GROK_BOT_WEBHOOK_KEY is set but GROK_BOT_WEBHOOK_URL is missing",
    });
  }
  if (env.wakeUrl && env.wakeKey && !env.replyBaseUrl) {
    issues.push({
      field: "BRIDGE_PUBLIC_BASE_URL",
      message: "Wake is configured but BRIDGE_PUBLIC_BASE_URL is missing (needed for reply_url)",
    });
  }

  return issues;
}
