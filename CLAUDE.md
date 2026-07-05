# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (Bun is the package manager)
bun install

# Development (starts Vite dev server + Tauri with hot reload)
bun run tauri:dev

# Build production desktop app
bun run tauri:build

# Frontend only (Vite dev server on http://localhost:3000)
bun run dev

# Lint and format
bun run lint          # eslint .
bun run lint:fix      # eslint . --fix
bun run format        # prettier --write .
bun run format:check  # prettier --check .

# Type check (also runs as part of `bun run build`)
tsc -b
```

Prerequisites: [Bun](https://bun.sh), [Rust](https://rustup.rs), and the [Claude CLI](https://claude.ai/code) on `PATH` with API access. The backend locates the `claude` binary via the `which` crate and spawns it as a subprocess.

## Architecture Overview

**Qualify** (package `qual`, Rust crate `qualify`) is a **Tauri 2 desktop application** for B2B lead research and qualification. It drives the Claude CLI as an AI backend to research companies and people, score leads against a customer profile, and generate conversation topics — streaming the agent's work to the UI in real time.

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend**: Rust + Tauri 2 + SQLite (`rusqlite`, bundled, WAL mode)
- **Server state**: TanStack Query (React Query) — all backend data is fetched/cached through it
- **UI state**: Zustand (stream panel, selection, settings)
- **Routing**: React Router (`react-router-dom`), pages are lazy-loaded
- **UI**: Radix UI primitives + Tabler Icons + Sonner toasts + Motion animations

### Directory Structure

```
src/                          # React frontend
├── App.tsx                   # Providers (QueryClient, LazyMotion), routes, layout shell
├── main.tsx                  # React entry point
├── pages/
│   ├── lead/                 # list.tsx, detail.tsx
│   ├── people/               # list.tsx, detail.tsx
│   ├── prompt.tsx            # Prompt editor page
│   └── scoring.tsx           # Scoring config page
├── components/
│   ├── ui/                   # Radix-wrapped primitives (button, dialog, select, command, ...)
│   ├── layout/               # sidebar, entity-detail-layout, model-selector, chrome-toggle
│   ├── leads/ · lead/        # Lead list, research panel, score bars/breakdown, modals
│   ├── people/               # People list, research/conversation panels, profile tabs
│   ├── scoring/ · prompt/    # config-editor, prompt-editor
│   ├── selection/            # Multi-select provider, floating action bar, command menu
│   ├── stream-panel/         # Real-time job output panel (tabs, content, subscription)
│   ├── onboarding/           # Company-overview dialog + checklist
│   └── status/               # Research + user status badges/selectors
└── lib/
    ├── query/                # React Query: query-client, keys, use-*-query hooks
    ├── hooks/                # Composed hooks (use-leads, use-people, use-job-submission, ...)
    ├── store/                # Zustand: stream-panel-store, selection-store, settings-store
    ├── stream/               # Stream event + job-log parsing (handle-stream-event, parsers)
    ├── tauri/                # Backend bridge: commands.ts, event-bridge.ts, types.ts
    ├── constants/            # status-config
    └── types/                # claude.ts, scoring.ts

src-tauri/src/                # Rust backend
├── lib.rs                    # Tauri builder: DB + JobQueue setup, tray, invoke_handler
├── main.rs                   # Binary entry (calls qualify_lib::run)
├── commands/                 # #[tauri::command] handlers, re-exported via mod.rs
│   ├── database.rs           # Lead/Person/Score CRUD
│   ├── research.rs           # start_research, start_person_research, scoring, find_leads, conversation
│   ├── jobs.rs               # Job listing/logs/cleanup
│   ├── prompts.rs            # Prompt get/save by type
│   ├── recovery.rs           # Stuck-entity recovery commands
│   └── settings.rs           # Model + Chrome settings
├── db/                       # schema.rs (structs), queries.rs, seed.rs, mod.rs (init + migrations)
├── jobs/                     # Async job system (see below)
│   ├── queue.rs              # JobQueue, concurrency, timeouts, process spawning
│   ├── result_parser.rs      # JobType enum, JobMetadata, output parsing
│   ├── stream_processor.rs   # Parses Claude stdout stream into events/logs
│   ├── completion_handler.rs # Persists results to DB on job completion
│   ├── enrichment.rs         # Structured enrichment.json handling
│   └── recovery.rs           # Startup recovery for stale jobs / stuck entities
├── prompts/                  # mod.rs + defaults/*.md embedded at compile time (include_str!)
└── events.rs                 # Typed event emission to the frontend
```

### Data Flow

1. **Frontend → Backend**: Tauri `invoke()` wrappers in `src/lib/tauri/commands.ts` call the `#[tauri::command]` handlers registered in `src-tauri/src/lib.rs`.
2. **Backend → Frontend (streaming)**: Research/scoring jobs stream output over a Tauri `Channel<StreamEvent>`; the frontend parses it via `lib/stream/*` into the stream panel.
3. **Backend → Frontend (reactive)**: The backend emits typed events (`lead-created`, `lead-updated`, `person-updated`, `lead-scored`, `people-bulk-created`, `lead-deleted`, `person-deleted`, `job-created`, `job-status-changed`). `lib/tauri/event-bridge.ts` listens and **invalidates the matching React Query keys** — the UI refetches; it does not hand-mutate a normalized store.
4. **State model**: React Query owns server data (keyed by `lib/query/keys.ts`); Zustand owns transient UI state only.

### Job System

Research, scoring, conversation, and lead-finding all run as async jobs that spawn a Claude CLI subprocess (`src-tauri/src/jobs/queue.rs`):

- **Job types** (`JobType`): `CompanyResearch`, `PersonResearch`, `Scoring`, `Conversation`, `LeadFinder`.
- **Concurrency**: max **5** concurrent jobs (semaphore); **10-minute** per-job timeout; **30-second** queue-wait timeout.
- **Persistence**: jobs and their logs are written to the `jobs` / `job_logs` tables so the stream panel survives reloads. On startup, `jobs::recovery::recover_on_startup` resets stale jobs and stuck entities; on reload, `event-bridge.ts` re-hydrates logs for still-running jobs from the DB.
- **Cleanup**: a `JobGuard` RAII type guarantees active-job removal, entity-status rollback, and error marking even on panic/early termination. Starting a new job for an entity cancels the existing active job of the same type.
- **Output**: each job writes files to a working dir (e.g. `company_profile.md`, `people.json`, `person_profile.md`, `score.json`, `conversation.md`, `enrichment.json`), which `completion_handler` parses back into SQLite.

### Prompts

Default prompts are markdown files under `src-tauri/src/prompts/defaults/` (`company.md`, `person.md`, `conversation_topics.md`) embedded at compile time via `include_str!`. Users can override them per type; the `company_overview` type has **no** default and must be provided during onboarding. `get_default_prompt` maps a type string to its embedded default.

### Settings

Single-row `settings` table exposes the Claude **model** (`opus` | `sonnet`, default `sonnet`) and a **use_chrome** flag, surfaced in the UI via `layout/model-selector.tsx` / `layout/chrome-toggle.tsx` and the `settings-store`.

## Database

Location: `~/.local/share/qual/data.db` (`dirs::data_dir()/qual/data.db`), opened in WAL mode.

Tables: `leads`, `people`, `prompts`, `scoring_config`, `lead_scores`, `jobs`, `job_logs`, `settings`.

Schema is created idempotently in `db/mod.rs::init_schema`; additive/constraint changes go through `run_migrations` in the same file (SQLite table-rebuild pattern for constraint drops). Default rows are seeded via `db/seed.rs`.

## Conventions

- **Rust ↔ TS naming**: backend structs use `#[serde(rename_all = "camelCase")]`, so DB snake_case columns arrive in the frontend as camelCase. Mirror types live in `src/lib/tauri/types.ts`.
- **New Tauri command**: add the handler under `commands/`, re-export it in `commands/mod.rs`, register it in the `invoke_handler!` list in `lib.rs`, and add a typed wrapper in `src/lib/tauri/commands.ts`.
- **New server data**: add a key to `lib/query/keys.ts`, a hook in `lib/query/`, and (if the backend mutates it) an event + `event-bridge.ts` invalidation.
- **Import alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`).
- **Frontend build output**: `out/` (Vite `outDir`), which Tauri consumes as `frontendDist`.

## Important Files

| Purpose               | Path                                  |
| --------------------- | ------------------------------------- |
| App routing / shell   | `src/App.tsx`                         |
| Tauri command wrappers| `src/lib/tauri/commands.ts`           |
| Event → query bridge  | `src/lib/tauri/event-bridge.ts`       |
| Query keys            | `src/lib/query/keys.ts`               |
| Stream panel store    | `src/lib/store/stream-panel-store.ts` |
| Backend setup / tray  | `src-tauri/src/lib.rs`                |
| Command registration  | `src-tauri/src/lib.rs` (`invoke_handler!`) |
| Job queue             | `src-tauri/src/jobs/queue.rs`         |
| DB structs            | `src-tauri/src/db/schema.rs`          |
| DB init + migrations  | `src-tauri/src/db/mod.rs`             |
| Default prompts       | `src-tauri/src/prompts/defaults/`     |
