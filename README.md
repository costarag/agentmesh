# AgentMesh

I work across several AI coding tools at once — Claude Code, OpenCode, and whatever I'm evaluating at any given moment. After a few weeks of real use, I had dozens of sessions scattered across different tools with no way to search them, track what I'd built, or even remember which tool I'd used for a given problem.

AgentMesh is the local-first layer I built to fix that. It sits alongside your AI tools, ingests transcripts in the background, and gives you a single searchable interface over all your sessions — with the full message history, extracted tasks, and token usage preserved per session.

Nothing leaves your machine. It runs entirely on Docker and Next.js.

https://media.licdn.com/dms/image/v2/D4D22AQGkUfirGN75Uw/feedshare-shrink_2048_1536/B4DZx3Xw_nHEAk-/0/1771529245443?e=1773273600&v=beta&t=fUD_YCofmj6Br27oZipVeTT7BB03wuADn2ceHAr1k0o

---

## What it does

- **Auto-ingests** from Claude Code (`~/.claude/projects/`) and OpenCode (`~/.local/share/opencode/`) on a configurable polling interval
- **Normalizes** every transcript into a canonical schema — sessions, messages, message parts, token counts — regardless of the source format
- **Preserves full fidelity**: tool calls, reasoning blocks, step markers, and model metadata are all stored at the part level, not flattened away
- **Deduplicates** via incremental checkpointing, so restarting the watcher never creates duplicates
- **Extracts tasks** from session content — checkbox lists, TODOs, and action items
- **Tracks usage** per session: prompt/completion token breakdown and a rough cost estimate
- **Searches** across all sessions by content, source tool, model, or date range
- **Manual import** via paste-a-transcript or structured message input, for tools that aren't yet wired up

---

## Stack

| Layer      | Tech                                              |
|------------|---------------------------------------------------|
| Frontend   | Next.js 15 App Router, React 19, Tailwind v4, shadcn UI |
| ORM        | Prisma 6                                          |
| Database   | PostgreSQL (Docker) — pgvector ready for future semantic search |
| Workers    | Bun                                               |
| Validation | Zod                                               |
| Types      | TypeScript strict mode                            |
| Linting    | Biome                                             |

---

## Getting started

You'll need [Docker](https://docs.docker.com/get-docker/) and [Bun](https://bun.sh) installed.

```bash
# 1. Install dependencies
bun install

# 2. Start Postgres
docker compose up -d

# 3. Apply the schema and load sample data
bun run db:migrate
bun run db:seed

# 4. Start the app
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The seed data gives you a few example sessions to explore before pointing it at real data.

Once you're ready to pull in your actual sessions:

```bash
# Pull in the last 30 days (one-time)
bun run ingest:backfill

# Keep polling in the background
bun run ingest:watch
```

---

## Scripts

| Script                     | What it does                          |
|----------------------------|---------------------------------------|
| `bun run dev`              | Start local dev server                |
| `bun run build`            | Production build                      |
| `bun run test`             | Run unit tests                        |
| `bun run typecheck`        | TypeScript check                      |
| `bun run lint`             | Biome lint                            |
| `bun run format`           | Biome format (writes)                 |
| `bun run db:migrate`       | Apply Prisma migrations               |
| `bun run db:seed`          | Seed sample data                      |
| `bun run db:reset`         | Reset DB and reseed                   |
| `bun run ingest:backfill`  | Ingest the last N days from all sources |
| `bun run ingest:watch`     | Run the continuous watcher            |
| `bun run ingest:status`    | Print ingestion source health         |
| `bun run data:cleanup-seed`| Remove seeded demo data               |

---

## Environment

Copy `.env.example` to `.env`. The defaults work out of the box with the Docker config.

```
DATABASE_URL              # Postgres connection string
CLAUDE_HOME               # Override Claude root (default: ~/.claude)
OPENCODE_HOME             # Override OpenCode root (default: ~/.local/share/opencode)
INGEST_LOOKBACK_DAYS      # Days to scan on first backfill (default: 30)
INGEST_POLL_INTERVAL_MS   # Watcher poll interval in ms (default: 30000)
```

---

## How ingestion works

The core abstraction is a **canonical bundle**: a source-agnostic representation of a session that any adapter can produce. The Claude Code and OpenCode adapters each read their native formats and emit this same bundle shape, which then flows through a shared upsert pipeline into Postgres.

```
Claude .jsonl files    ─┐
OpenCode storage/      ─┼──▶  source adapter  ──▶  canonical bundle  ──▶  Prisma upsert  ──▶  PostgreSQL
Manual paste / form    ─┘
```

Ingestion is incremental — each source stores a timestamp checkpoint, so only files modified since the last run are processed. Sessions are deduplicated by `(sourceToolId, externalSessionId)` as the natural key.

---

## Testing

```bash
bun run test
```

Unit tests cover the ingestion core: Zod schema validation, transcript parsing, role and part-type mapping, content sanitization, and session summary derivation. Bun's built-in test runner is used — no Jest config needed.

---

## What's next

- Semantic search using pgvector (the schema is already ready for embeddings)
- Cursor and ChatGPT source adapters
- Cost estimation with real per-model pricing tables
- Export to markdown and CSV
- Better session diff and version history view
