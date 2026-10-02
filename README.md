# Wandr (working name)

A group trip "inbox": drop TikToks, links or screenshots into a trip, AI resolves each to a real
place, friends vote by text, and receipts get split. The spec is [`REQUIREMENTS.md`](REQUIREMENTS.md);
how we work is in [`CLAUDE.md`](CLAUDE.md); unresolved spec questions are in
[`docs/open-questions.md`](docs/open-questions.md).

## Run it locally (no accounts needed)

```bash
corepack enable            # pnpm 10
pnpm install
pnpm dev                   # http://localhost:3000
```

With no environment variables the app is fully usable offline:

- **Database:** in-process Postgres (PGlite) under `apps/web/.data/pglite`, with every migration and
  Row Level Security policy applied. Delete that folder to start fresh.
- **Sign-in codes:** printed in the server console; `000000` also works outside production.
- **Texts and email:** printed in the server console and logged in `outbound_messages`.
- **AI:** a heuristic extractor stands in for Claude; set `ANTHROPIC_API_KEY` for the real thing.
- **Background jobs:** run in-process after each request; set the Inngest keys to use Inngest.

Copy [`.env.example`](.env.example) to `apps/web/.env.local` to turn on Supabase, Twilio, Claude
(`claude-opus-5-5` by default), Google Places/Maps, Inngest, Resend, PostHog and Sentry.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app: pages, server actions, route handlers, `src/server/*` services |
| `packages/core` | Pure domain logic: money (splits, balances), voting/ranking, permissions, stages, optimizer, metrics |
| `packages/db` | Drizzle schema, SQL migrations incl. RLS (`migrations/*.sql`), PGlite harness |
| `packages/ai` | Link intake (SSRF-safe fetch), Claude extraction + receipt prompts, Places, evals |

## Tests

```bash
pnpm test                                  # unit + RLS integration tests (all packages)
pnpm typecheck && pnpm lint
pnpm --filter @wandr/web test:e2e          # Playwright: landing + duo trip, desktop and phone
pnpm --filter @wandr/ai eval               # extraction/receipt evals (live with ANTHROPIC_API_KEY)
```

## Production database

```bash
DATABASE_URL=postgres://… pnpm --filter @wandr/db migrate   # direct connection, not the pooler
```

Migrations run in file order and are recorded in `_wandr_migrations`, so hand-written SQL (RLS,
triggers) runs alongside drizzle-kit output.
