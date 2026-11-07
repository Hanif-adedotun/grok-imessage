# Architecture: iMessage ↔ Grok Bot Bridge

## Goal

Give a person an **iMessage front door** to an existing **Grok Bot** (Cursor / Grok Bot apps) that already has compounding memory, skills, and a cloud computer — without waiting for an official Grok Bot chat API.

iMessage is not the brain. **Grok Bot remains the brain.** This system is glue: wake the Bot with inbound texts, and deliver the Bot’s reply back as iMessage.

**iMessage transport:** [Spectrum](https://photon.codes/docs/spectrum-ts) (`spectrum-ts`), Photon’s managed iMessage provider — same stack as a Spectrum “relay” app (`src/index.ts` + `bun start`).

**Project name:** `grok-imessage` (MIT).

---

## Stack (locked)

| Layer | Choice |
|---|---|
| Runtime | Bun + TypeScript |
| Monorepo | Bun workspaces (`apps/*`) |
| Bridge | [`apps/bridge`](../apps/bridge) — `spectrum-ts@^8`, Hono |
| Inbound | Long-lived Spectrum `app.messages` stream |
| HTTP | Hono — `GET /health`, `POST /reply` |
| Landing | [`apps/web`](../apps/web) — Astro static site |
| Tokens (v1) | In-memory map (single process) |
| Deploy | Bridge always-on (e.g. Railway/Fly); web on Pages/CF |
| License | MIT |

---

## Constraints (platform reality)

| Constraint | Implication |
|---|---|
| No official Grok Bot list / send / transcript API ([Cursor forum](https://forum.cursor.com/t/grok-bot-official-api-to-create-bots-and-send-receive-chat-for-companion-uis/170985/8)) | Cannot open the Bot’s chat thread directly from our server |
| Bot conversations live only in the Grok Bot apps | Memory stays on Cursor’s Bot/computer side |
| Routine **webhook** is the official inbound hook | `POST` + Bearer key starts a run; `200` means accepted, not finished |
| Outbound must be built by us | Bot (or MCP tool) POSTs the reply to our bridge |

**Non-goal (v1):** Sharing memory with the raw xAI API (`api.x.ai`). That path is a separate product (BYO API key + our own memory store). This architecture targets **the same Grok Bot the user already uses**.

---

## High-level design

```
┌─────────────┐     iMessage      ┌──────────────────────────────────────┐
│  Your phone │ ◄───────────────► │  Spectrum Cloud (managed line)       │
└─────────────┘                   │  Photon / spectrum-ts imessage       │
                                  └───────────────┬──────────────────────┘
                                                  │ gRPC / SDK stream
                                                  ▼
                                  ┌──────────────────────────────────────┐
                                  │  Bridge = Spectrum app               │
                                  │  (Bun, spectrum-ts ^8)               │
                                  │  • app.messages loop                 │
                                  │  • reply token store                 │
                                  │  • POST /reply (HTTPS)               │
                                  │  • optional MCP: send_reply          │
                                  └───────┬──────────────────▲───────────┘
                     1. wake routine      │                  │ 2. reply
                        webhook           │                  │    (HTTP or MCP)
                                          ▼                  │
                                  ┌──────────────────────────────────────┐
                                  │  Grok Bot                            │
                                  │  • memory, skills, cloud computer    │
                                  │  • routine + webhook trigger         │
                                  └──────────────────────────────────────┘
```

Two one-way hops stitched into a loop:

1. **Inbound:** iMessage → Spectrum → Bridge message loop → Grok Bot routine webhook  
2. **Outbound:** Grok Bot → Bridge `/reply` (or MCP) → `space.send` / `message.reply` via Spectrum  

The bridge **is** a Spectrum agent server. Providers own the interface; the bridge owns routing to Grok Bot.

---

## Components

### 1. iMessage transport — Spectrum Cloud

| Item | Choice |
|---|---|
| SDK | `spectrum-ts@^8.0.0` (pinned) |
| Runtime | Bun (`bun start`) |
| Provider | `imessage` from `spectrum-ts/providers/imessage` |
| Auth | Spectrum Cloud `PROJECT_ID` + `PROJECT_SECRET` ([Photon dashboard](https://app.photon.codes)) |
| Lines | Project-owned managed iMessage lines (auto-discovered / renewed by the SDK) |

Spectrum Cloud owns line provisioning, delivery, and native iMessage features. The bridge only runs the Spectrum SDK message loop.

Entry pattern (same shape as a Spectrum relay app):

```ts
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [imessage.config()],
});

for await (const [space, message] of app.messages) {
  // wake Grok Bot; hold space for later reply delivery
}
```

**Inbound primitives**

| Spectrum concept | Role in this bridge |
|---|---|
| `Space` | Conversation to reply into; stored against `reply_token` |
| `Message` | Inbound content (`text`, attachment, …) |
| `message.platform` | Expect `"imessage"` (cloud) |
| `sender` | Allowlist / identity checks |

**Outbound primitives** (when `/reply` fires)

| API | Use |
|---|---|
| `space.send(...)` / content builders | Deliver Bot reply as iMessage |
| `message.reply(...)` | Optional threaded reply to the triggering message |
| `space.responding(async () => { … })` | Typing indicator while waiting on Grok Bot (best-effort; Bot may outlive the wait) |
| `message.react(...)` | Optional instant ack (“like”) before the Bot finishes |

Outgoing content uses Spectrum builders (text, attachment, voice, contact, richlink, poll, group, custom) — see the `spectrum` skill / [Spectrum docs](https://photon.codes/docs/spectrum-ts).

**Agent / ops tooling**

- Spectrum skill: [`photon-hq/skills`](https://github.com/photon-hq/skills) (`spectrum`)
- Project ops: Photon CLI skill (`photon-cli`) — `photon whoami`, `photon spectrum lines list`, `photon projects regenerate-secret`, etc.
- Do **not** commit or echo `.env`. If auth fails at startup, verify `PROJECT_ID` / `PROJECT_SECRET` in the dashboard.

### 2. Bridge service (Spectrum app + HTTP)

One process (or colocated processes) that:

| Surface | Purpose |
|---|---|
| Spectrum `app.messages` loop | Receive inbound iMessages |
| Grok Bot routine client | `POST` wake payload with text + reply credentials |
| `POST /reply` (public HTTPS) | Accept Bot (or MCP) reply; `space.send` via Spectrum |
| Token / space store | Map one-shot `reply_token` → Spectrum `Space` (+ optional original `Message`) |
| Optional MCP server | Expose `send_reply(text)` so the Bot doesn’t raw-HTTP |

`POST /reply` must be reachable by Grok Bot on the public internet (or via a tunnel). The Spectrum SDK talks to Photon Cloud for all send/receive.

### 3. Grok Bot routine

Configured **once** on the user’s existing Bot:

- **When:** webhook trigger (URL + Bearer key from the desktop routine panel)
- **What:** treat inbound JSON `text` as a message from the user over iMessage; use normal memory and tools; when done, deliver a short reply via the provided callback

Preferred delivery: **MCP tool** `send_reply`. Fallback: instruction to `POST` JSON to `reply_url` with `Authorization: Bearer <reply_token>`.

### 4. Optional MCP server

Runs alongside (or inside) the bridge. Registered as a custom MCP connector on the Bot.

```
send_reply(text: string, reply_token?: string) → { ok: boolean }
```

The MCP calls the same internal “deliver reply” path as `POST /reply` (resolve token → Spectrum `space.send`).

MCP is more reliable than “please curl when finished,” because tool calling is structured and Auto-review can allowlist it.

---

## Sequence: happy path

```
User              Spectrum Cloud       Bridge (spectrum-ts)     Grok Bot
  │                     │                      │                    │
  │  "calendar tmrw?"   │                      │                    │
  │────────────────────►│                      │                    │
  │                     │  app.messages        │                    │
  │                     │  [space, message]    │                    │
  │                     │─────────────────────►│                    │
  │                     │                      │ create reply_token │
  │                     │                      │ store token→space  │
  │                     │                      │ optional react/    │
  │                     │                      │ typing             │
  │                     │                      │                    │
  │                     │                      │ POST routine webhook
  │                     │                      │ { text, reply_url, │
  │                     │                      │   reply_token }    │
  │                     │                      │───────────────────►│
  │                     │                      │  200 accepted      │
  │                     │                      │◄───────────────────│
  │                     │                      │                    │
  │                     │                      │     (Bot thinks /  │
  │                     │                      │      uses memory)  │
  │                     │                      │                    │
  │                     │                      │ POST /reply        │
  │                     │                      │ Bearer token       │
  │                     │                      │ { text: "…" }      │
  │                     │                      │◄───────────────────│
  │                     │                      │ validate + consume │
  │                     │  space.send / reply  │                    │
  │  reply iMessage     │◄─────────────────────│                    │
  │◄────────────────────│                      │                    │
```

---

## Inbound wake payload

Bridge → Grok Bot routine webhook:

```json
{
  "text": "what's on my calendar tomorrow?",
  "from": "+15551234567",
  "space_id": "<spectrum-space-id>",
  "message_id": "<spectrum-message-id>",
  "platform": "imessage",
  "reply_url": "https://bridge.example.com/reply",
  "reply_token": "<high-entropy secret>",
  "correlation_id": "<uuid>",
  "sent_at": "2026-11-07T05:26:00Z"
}
```

`space_id` / `message_id` are for our logs and optional threaded `message.reply`. The Bot must **not** choose the destination chat — only the bridge maps `reply_token` → Spectrum `Space`.

Routine instruction (illustrative):

> When this webhook fires, treat `text` as a message from me via iMessage. Use your normal memory, skills, and tools. Prefer a concise reply suitable for iMessage (under ~1500 characters). When finished, call MCP `send_reply` with the reply text and `reply_token`, **or** `POST` `{"text":"<reply>","correlation_id":"<id>"}` to `reply_url` with header `Authorization: Bearer <reply_token>`. Never put the token in the URL. Never send the reply to anyone else.

---

## Outbound reply API

### `POST /reply`

**Headers**

```http
Authorization: Bearer <reply_token>
Content-Type: application/json
```

**Body**

```json
{
  "text": "You have 3 meetings tomorrow: 9:00 standup, …",
  "correlation_id": "<uuid>"
}
```

**Behavior**

1. Reject if missing/invalid/expired token (`401` / `403`)
2. Resolve `token → Space` (and optional original `Message`)
3. Deliver via Spectrum (`space.send` and/or `message.reply` with text builders)
4. Invalidate token (one-shot)
5. Return `{ "ok": true }`

**Idempotency:** A second POST with the same consumed token returns `410` or `{ "ok": true, "duplicate": true }` without sending again — Bots may retry.

### Why not `/reply?token=…`

Query tokens leak into access logs, proxies, crash reports, and `Referer` headers. Prefer **Bearer**. If a query param is unavoidable for a prototype, use a long random secret and still rotate per message.

---

## Data model (minimal)

### `ReplyToken`

| Field | Type | Notes |
|---|---|---|
| `token_hash` | string | Store hash only (e.g. SHA-256); compare on lookup |
| `space_ref` | opaque | In-memory / persisted handle to Spectrum `Space` (or ids needed to re-bind) |
| `message_id` | string \| null | Original inbound message for threaded `reply` |
| `from` | string | Sender id / handle |
| `correlation_id` | uuid | Ties wake ↔ reply for logs |
| `created_at` | datetime | |
| `expires_at` | datetime | Short TTL (e.g. 15–60 minutes) |
| `consumed_at` | datetime \| null | Set on successful deliver |

**Note:** Spectrum `Space` objects may be process-local. For a single long-running Bun process, keep an in-memory `Map` from token → `{ space, message }`. If the process restarts mid-flight, in-flight tokens are lost (acceptable for personal v1; harden later with durable space ids if the SDK exposes stable rehydration).

### Config (env / secrets)

| Secret | Purpose |
|---|---|
| `PROJECT_ID` | Spectrum Cloud project id |
| `PROJECT_SECRET` | Spectrum Cloud project secret |
| `GROK_BOT_WEBHOOK_URL` | Routine “POST to” URL |
| `GROK_BOT_WEBHOOK_KEY` | Routine Bearer key |
| `BRIDGE_PUBLIC_BASE_URL` | Used to build `reply_url` |
| `REPLY_TOKEN_PEPPER` | Server-side pepper for hashing tokens |
| `ALLOWED_SENDERS` | Optional allowlist of iMessage handles / user ids |

`.env` is gitignored. **Never commit, read aloud, or log secret values.** Rotate Spectrum secrets with `photon projects regenerate-secret` when needed, then update `.env`.

No need to store iMessage transcripts long-term for v1; Grok Bot already holds conversational memory.

---

## Security

1. **HTTPS only** on `POST /reply` (Grok Bot must reach it).
2. **One-shot, short-lived reply tokens**; hash at rest.
3. **Bind token → single Spectrum space**; never accept a client-supplied chat destination on `/reply`.
4. **Allowlist inbound senders** before waking the Bot.
5. **Rate-limit** inbound wakes and `/reply`.
6. Treat Spectrum project secret, webhook key, and reply tokens like passwords.
7. Routine / Auto-review: allow only the bridge MCP or `reply_url` host for outbound delivery.
8. Assume webhook bodies are untrusted input to the Bot — keep the routine narrow so it doesn’t act on spoofed instructions beyond “answer this text.”
9. Filter echo / own-account messages in the Spectrum loop so the bridge does not re-wake the Bot on its own sends.

---

## Failure modes

| Failure | User-visible effect | Mitigation |
|---|---|---|
| Spectrum auth error | App won’t start | Verify `PROJECT_ID` / `PROJECT_SECRET` in [Photon dashboard](https://app.photon.codes) |
| No line on project | Can’t send/receive | `photon spectrum lines list`; provision line in dashboard |
| Webhook non-200 | No Bot run | Log; optional iMessage “couldn’t reach Bot” |
| Bot ignores callback | Silence after wake | Timeout job + MCP preference |
| Auto-review blocks MCP/HTTP | Silence | Pre-allow the tool/host |
| Token expired / process restart | `/reply` fails | Longer TTL; single long-lived process; optional durable space map later |
| Long Bot runs | Minutes of lag | Early `react`; set expectations; typing only covers short waits |
| Duplicate `/reply` | Double text | Consume token before send; idempotent response |

---

## Latency model

This is **asynchronous task messaging**, not instant chat:

```
T0     user sends iMessage
T0+ε   Spectrum delivers to app.messages; bridge wakes Bot (HTTP 200)
T0+…   Bot runs (seconds to minutes)
T1     Bot/MCP posts /reply → Spectrum sends iMessage
```

Suitable for: kick off work, ask the Bot that already knows you, get a reply when ready.  
Unsuitable for: rapid back-and-forth that must feel like iMessage with a human.

---

## Deployment topologies

### Personal MVP

- Bun process running the Spectrum bridge (`bun start`)
- Spectrum Cloud project with at least one managed iMessage line
- Public HTTPS for `/reply` (same process via reverse proxy, or sidecar)
- Grok Bot routine + optional MCP pointing at the bridge
- Optional `terminal` provider in the same `Spectrum({ providers })` list for local dry-runs without burning iMessage

### Hardened personal

- Bridge on a small always-on host (VPS / Railway / etc.)
- Secrets via env / secret manager, not committed files
- MCP as remote HTTPS with its own auth
- Monitoring on wake failures and `/reply` 4xx rates

### Multi-user (later)

Out of scope for v1. Would need per-user Bot webhooks, per-user Spectrum routing, and isolation. Current design assumes **one human, one Bot, one Spectrum project / line**.

---

## Repository shape

```
apps/
  bridge/                 # Bun Spectrum + Hono bridge
    src/
      index.ts            # Spectrum() + message loop + HTTP server
      http.ts             # Hono routes
      bridge/
        wake.ts           # POST Grok Bot routine webhook
        reply.ts          # POST /reply → space.send
        tokens.ts         # one-shot reply tokens
  web/                    # Astro landing (static)
docs/
  ARCHITECTURE.md
.env.example
LICENSE                   # MIT
README.md
```

Agent working notes for Spectrum (install if missing):

```sh
npx skills add photon-hq/skills --skill spectrum --agent '*'
npx skills add photon-hq/skills --skill photon-cli --agent '*'
```

---

## Relationship to xAI API (explicit fork)

| Track | Brain | Memory | Status |
|---|---|---|---|
| **This architecture** | Grok Bot | Bot memory / computer | Implementable via webhook + callback + Spectrum |
| **Alternate product** | `api.x.ai` Responses API | Our DB / Collections | Full chat control; **does not** see Grok Bot memory |

Do not mix them in v1. If Cursor later ships official `list` / `send` / `transcript`, the bridge can grow a `provider: grok-bot-native` adapter and retire the webhook stitch where possible. Spectrum remains the iMessage edge either way.

---

## Suggested implementation phases

1. **Spectrum echo** — run the bridge with `imessage` (+ optional `terminal`); receive and echo text with `space.responding` / `message.reply`
2. **Wake only** — inbound text → Grok Bot routine webhook; reply stays in the Grok Bot app
3. **Callback loop** — `POST /reply` + routine HTTP instruction; deliver the Bot reply through Spectrum
4. **MCP** — replace fragile “please POST” with `send_reply`
5. **Hardening** — allowlist, token hashing, TTL, idempotency, echo filtering, logging

---

## Summary

| Question | Answer |
|---|---|
| Where does memory live? | On **Grok Bot** (unchanged) |
| What carries iMessage? | **Spectrum Cloud** via `spectrum-ts` + `imessage` provider |
| How does iMessage talk *to* the Bot? | Bridge POSTs the routine **webhook** |
| How does the Bot talk *back*? | MCP `send_reply` or HTTP `POST /reply` → Spectrum `space.send` / `message.reply` |
| Is this official Grok Bot chat API? | **No** — supported wake hook + our delivery sink |
| Can we build it today? | **Yes** |
