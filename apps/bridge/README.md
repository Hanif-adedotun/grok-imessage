# `@grok-imessage/bridge`

Bun service that connects Spectrum iMessage to a Grok Bot routine webhook.

## Run

From the repo root:

```bash
cp .env.example .env
# set PROJECT_ID + PROJECT_SECRET
bun run dev:bridge
```

- Without Spectrum credentials: `GET /health` and `POST /reply` still listen.
- With Spectrum credentials only: inbound texts **echo** (phase 1).
- With `GROK_BOT_WEBHOOK_*` + `BRIDGE_PUBLIC_BASE_URL`: inbound texts **wake** the Bot; replies arrive via `POST /reply`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `POST` | `/reply` | Bot/MCP callback (`Authorization: Bearer <reply_token>`) |
