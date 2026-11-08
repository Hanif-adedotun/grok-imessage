import type { Message, Space } from "spectrum-ts";
import type { TokenStore } from "./tokens.ts";
import type { WakeDeps, WakeFetch, WakePayload, WakeResult } from "./wake.ts";

export type InboundInput = {
  contentType: string;
  text: string;
  from: string;
  platform: string;
  isAgent: boolean;
  space: Space;
  message: Message;
};

export type InboundDeps = {
  store: TokenStore;
  wake: (deps: WakeDeps, payload: WakePayload) => Promise<WakeResult>;
  fetch: WakeFetch;
  wakeUrl: string;
  wakeKey: string;
  replyUrl: string;
  allowlist: Set<string> | null;
  nowIso: () => string;
  uuid: () => string;
};

export type InboundResult =
  | { outcome: "ignored"; reason: "non_text" | "empty" | "allowlist" | "agent" }
  | { outcome: "echoed" }
  | { outcome: "woken"; correlationId: string }
  | { outcome: "wake_failed" };

function wakeEnabled(deps: InboundDeps): boolean {
  return Boolean(deps.wakeUrl.trim() && deps.wakeKey.trim());
}

export async function handleInbound(
  input: InboundInput,
  deps: InboundDeps,
): Promise<InboundResult> {
  if (input.isAgent) {
    return { outcome: "ignored", reason: "agent" };
  }
  if (input.contentType !== "text") {
    return { outcome: "ignored", reason: "non_text" };
  }

  const text = input.text.trim();
  if (!text) {
    return { outcome: "ignored", reason: "empty" };
  }

  if (deps.allowlist && !deps.allowlist.has(input.from)) {
    return { outcome: "ignored", reason: "allowlist" };
  }

  if (!wakeEnabled(deps)) {
    await input.space.responding(async () => {
      await input.message.reply(`echo: ${text}`);
    });
    return { outcome: "echoed" };
  }

  const replyToken = deps.store.mint();
  const correlationId = deps.uuid();
  deps.store.bind(replyToken, {
    space: input.space,
    message: input.message,
    from: input.from,
    correlationId,
  });

  const wake = await deps.wake(
    {
      fetch: deps.fetch,
      url: deps.wakeUrl,
      key: deps.wakeKey,
    },
    {
      text,
      from: input.from,
      platform: input.platform,
      reply_url: deps.replyUrl,
      reply_token: replyToken,
      correlation_id: correlationId,
      sent_at: deps.nowIso(),
    },
  );

  if (!wake.ok) {
    deps.store.unbind(replyToken);
    await input.space.send("Couldn't reach your Grok Bot just now. Try again in a bit.");
    return { outcome: "wake_failed" };
  }

  try {
    await input.message.react("like");
  } catch {
    // tapbacks are best-effort
  }

  return { outcome: "woken", correlationId };
}
