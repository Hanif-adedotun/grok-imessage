# grok-imessage

**Text your [Grok Bot](https://cursor.com/docs/grok-bot) from iMessage.**

Grok Bot keeps the memory, skills, and cloud computer. This project is the glue: it receives iMessages through [Spectrum](https://photon.codes/docs/spectrum-ts), wakes your Bot via a routine webhook, and delivers the reply back as a blue bubble.

> There is no official Grok Bot chat API yet ([Cursor forum](https://forum.cursor.com/t/grok-bot-official-api-to-create-bots-and-send-receive-chat-for-companion-uis/170985/8)). Targeting a specific Bot means configuring **that Bot’s** routine webhook URL and key.

[Architecture](docs/ARCHITECTURE.md) · [Epics](docs/EPICS.md) · [MIT License](LICENSE)

---

## Status

**Scaffold on `main`.** Core bridge implementation follows TDD epics in [`docs/EPICS.md`](docs/EPICS.md). Not production-ready.

| Piece | State |
|---|---|
| Monorepo (Bun workspaces) | Ready |
| Bridge HTTP (`/health`, `/reply`) | Stub |
| Spectrum message loop | Stub (echo / wake paths sketched) |
| Landing (`apps/web`) | Built — animated phone demo |
| Tests | Not started (Epic 0) |

---

## How it works

```
iMessage → Spectrum → bridge → Grok Bot routine webhook
                                    ↓
iMessage ← Spectrum ← bridge ← POST /reply (Bot or MCP)
```

1. You text the Spectrum line.
2. The bridge mints a one-shot reply token, binds it to the chat, and POSTs your text to the Bot routine webhook.
3. The Bot runs with its existing memory.
4. When finished, the Bot (or an MCP tool) POSTs the answer to `/reply` with that token; the bridge sends the iMessage.

Details, security, and failure modes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Monorepo

| Package | Path | Role |
|---|---|---|
| `@grok-imessage/bridge` | [`apps/bridge`](apps/bridge) | Bun + Spectrum + Hono |
| `@grok-imessage/web` | [`apps/web`](apps/web) | Astro landing (static) |

**Stack:** Bun · TypeScript · `spectrum-ts@^8` · Hono · Astro · MIT

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- A [Spectrum Cloud](https://app.photon.codes) project with an iMessage line (`PROJECT_ID` / `PROJECT_SECRET`)
- (For the wake loop) A Grok Bot routine with a webhook trigger

---

## Quick start

```bash
git clone https://github.com/Hanif-adedotun/grok-imessage.git
cd grok-imessage
bun install
cp .env.example .env
```

Fill Spectrum credentials in `.env` (never commit `.env`):

```bash
bun run dev:bridge   # http://localhost:3000/health
bun run dev:web      # landing page
```

| Mode | Env | Behavior |
|---|---|---|
| HTTP only | (no Spectrum) | `/health` and `/reply` listen |
| Echo | `PROJECT_ID` + `PROJECT_SECRET` | Inbound text echoed |
| Wake | + `GROK_BOT_WEBHOOK_*` + `BRIDGE_PUBLIC_BASE_URL` | Wakes Bot; reply via `POST /reply` |

See [`apps/bridge/README.md`](apps/bridge/README.md) and [`.env.example`](.env.example).

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev:bridge` | Bridge with watch |
| `bun run dev:web` | Astro dev server |
| `bun run start` | Bridge production entry |
| `bun run build` | Build landing site |
| `bun run typecheck` | Typecheck workspace packages |

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — system design, Spectrum, wake/reply, security
- [Epics](docs/EPICS.md) — TDD build order for `apps/bridge`
- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- [Grok Bot docs](https://cursor.com/docs/grok-bot)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: open an issue or PR against `main`; bridge work should follow the epic order and include tests.

---

## Security

- Do not commit secrets (`.env` is gitignored).
- Reply tokens are one-shot Bearer credentials — prefer header auth, not query strings.
- Report sensitive issues privately to the maintainer rather than filing a public issue with secrets.

---

## License

[MIT](LICENSE)
