# Contributing

Thanks for helping with **grok-imessage**.

## Setup

```bash
bun install
cp .env.example .env
```

Use a throwaway Spectrum project for local work when possible.

## Branching

- `main` — stable scaffold and releases
- Feature / epic branches off `main` (e.g. `epic/0-test-harness`, `staging` for integration)

Open PRs into `main` unless a maintainer asks otherwise.

## Bridge work

Core development is tracked in [`docs/EPICS.md`](docs/EPICS.md).

1. Prefer **TDD** (failing test → implementation → refactor).
2. Keep modules small; inject dependencies (`fetch`, clock, token store).
3. No drive-by refactors outside the epic you’re on.
4. Run checks before pushing:

```bash
bun run typecheck
bun test   # once Epic 0 lands
```

## Commit messages

Short imperative summaries are enough, e.g. `Add TokenStore consume-after-send tests`.

## Code of conduct

Be respectful. No harassment, no dumping secrets in issues or PRs.
