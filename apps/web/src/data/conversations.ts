/**
 * Sample exchanges for the hero. Each one is a question you might text your own
 * Bot and the answer it gives back from its memory of this project, so every
 * reply matches something that is actually written down in docs/.
 */

export type Exchange = {
  /** When the message landed, as HH:MM:SS. */
  at: string;
  /** Seconds the Bot took before it posted the reply. */
  took: number;
  question: string;
  reply: string;
};

export type TraceRow = { at: string; actor: string; event: string; delta: string };

export const conversations: Exchange[] = [
  {
    at: "23:41:06",
    took: 2.94,
    question: "what did I decide about the token store?",
    reply:
      "In-memory map for v1, single process. Redis only once the bridge runs on more than one instance — it's in ARCHITECTURE.md under Tokens.",
  },
  {
    at: "22:17:03",
    took: 2.1,
    question: "why can't we call the Grok Bot API directly?",
    reply:
      "There isn't one yet — no official list, send or transcript endpoint. That's why we wake your Bot through its routine webhook instead.",
  },
  {
    at: "00:52:21",
    took: 3.4,
    question: "how does the reply get back to my phone?",
    reply:
      "Your Bot POSTs to /reply with the one-shot bearer token. The bridge resolves it to the Spectrum space and sends it as a normal iMessage.",
  },
  {
    at: "21:08:44",
    took: 1.8,
    question: "remind me what the MCP tool does",
    reply:
      "send_reply(text) goes through the same deliver path as POST /reply, so the Bot never hand-rolls HTTP. Tool calls are easier to allowlist too.",
  },
  {
    at: "23:04:12",
    took: 3.7,
    question: "what's left before this is production ready?",
    reply:
      "Epics 0 through 7 are done and the suite is green. What's missing is a live run: a real Spectrum line, your routine webhook, and /reply on public HTTPS.",
  },
  {
    at: "01:26:09",
    took: 2.6,
    question: "did we ever sort out duplicate wakes?",
    reply:
      "Epic 6. Dedup on message id, a rate limit per sender, and a wake timeout so a Bot that never answers stops holding its token.",
  },
  {
    at: "20:33:51",
    took: 2.2,
    question: "where is the bridge meant to run?",
    reply:
      "Somewhere always-on, Railway or Fly. /reply has to be reachable over public HTTPS or your Bot has nowhere to call back to.",
  },
  {
    at: "22:49:17",
    took: 3.1,
    question: "what env do I need for the full loop?",
    reply:
      "PROJECT_ID and PROJECT_SECRET for Spectrum, then GROK_BOT_WEBHOOK_* and BRIDGE_PUBLIC_BASE_URL. Without the webhook vars it only echoes.",
  },
  {
    at: "23:58:02",
    took: 1.9,
    question: "can you show typing dots while you think?",
    reply:
      "space.responding wraps the wait, so you get them. Best effort though — if I run past the window the indicator drops before I answer.",
  },
  {
    at: "00:14:38",
    took: 2.8,
    question: "is the reply token safe in a URL?",
    reply:
      "Prefer the Authorization header. Query strings land in logs and proxies, and that token is a one-shot credential for your thread.",
  },
];

/** Adds whole seconds to an HH:MM:SS stamp, rolling over cleanly. */
function bump(at: string, seconds: number): string {
  const [h = 0, m = 0, s = 0] = at.split(":").map(Number);
  const total = (h * 3600 + m * 60 + s + seconds + 86400) % 86400;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** The four bridge events for one exchange, timed off when it arrived. */
export function traceFor(exchange: Exchange): TraceRow[] {
  return [
    { at: exchange.at, actor: "spectrum", event: "message received", delta: "+0.00s" },
    { at: exchange.at, actor: "bridge", event: "reply token minted", delta: "+0.01s" },
    { at: bump(exchange.at, 1), actor: "bot", event: "routine woken", delta: "+0.34s" },
    {
      at: bump(exchange.at, Math.round(exchange.took)),
      actor: "bridge",
      event: "POST /reply",
      delta: `+${exchange.took.toFixed(2)}s`,
    },
  ];
}

/** The clock shown in the status bar and the thread divider. */
export function clockFor(exchange: Exchange): string {
  return exchange.at.slice(0, 5);
}
