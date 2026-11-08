# `@grok-imessage/bridge`

Bun service that connects Spectrum iMessage to a Grok Bot routine webhook.

## Run

From the repo root:

```bash
cp .env.example .env
# set PROJECT_ID + PROJECT_SECRET (and wake vars for the full loop)
bun run dev:bridge
```

Startup validates env pairs (Spectrum, wake, public base URL). Misconfiguration exits with a clear `[env] …` message.

| Mode | Env | Behavior |
|---|---|---|
| HTTP only | (no Spectrum) | `GET /health`, `POST /reply` |
| Echo | `PROJECT_ID` + `PROJECT_SECRET` | Inbound text → `echo: …` |
| Wake | + `GROK_BOT_WEBHOOK_*` + `BRIDGE_PUBLIC_BASE_URL` | Wake Bot; reply via `POST /reply` |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ ok, service, spectrum, wake }` |
| `POST` | `/reply` | Bot/MCP callback (`Authorization: Bearer <reply_token>`) |

Example:

```bash
curl -s localhost:3000/health
# {"ok":true,"service":"grok-imessage-bridge","spectrum":false,"wake":false}
```

## Smoke checklist

### A. Echo (Spectrum only)

1. Set `PROJECT_ID` / `PROJECT_SECRET` in `.env`.
2. `bun run dev:bridge` — log shows `[spectrum] connected`.
3. `curl -s localhost:3000/health` → `"spectrum":true`.
4. Message the Spectrum line (or use the `terminal` provider if attached).
5. Expect a reply: `echo: <your text>`.

### B. Wake → `/reply` (full loop)

1. On the target Grok Bot, create a routine with a **webhook** trigger. Copy URL + key.
2. Set in `.env`:
   - `GROK_BOT_WEBHOOK_URL` / `GROK_BOT_WEBHOOK_KEY`
   - `BRIDGE_PUBLIC_BASE_URL` — public HTTPS origin of this bridge (e.g. tunnel), **no trailing slash**
3. Routine instruction (sketch): treat JSON `text` as an iMessage; when done, `POST` `{"text":"<reply>"}` to `reply_url` with `Authorization: Bearer <reply_token>`.
4. Restart bridge — `/health` → `"wake":true`.
5. Send an iMessage to the line → expect a tapback “like” (best-effort).
6. Simulate the Bot callback (use the `reply_token` from bridge logs if you add logging, or from the webhook payload the Bot received):

```bash
curl -s -X POST "$BRIDGE_PUBLIC_BASE_URL/reply" \
  -H "Authorization: Bearer <reply_token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello from curl"}'
```

7. Expect that text as an iMessage in the same chat.
8. Repeat the same curl → `410` `{ "error": "consumed" }`.

### C. Failure paths

- Wake URL wrong → inbound gets a short “Couldn't reach your Grok Bot…” text; token unbound.
- `/reply` with bad Bearer → `401` / `403`.

## Tests

```bash
bun test
bun run --filter @grok-imessage/bridge typecheck
```
