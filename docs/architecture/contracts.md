# Contracts

This file is the checklist for changes that cross process or runtime boundaries.

## Provider Turn Contract

When a task touches provider turn payloads, chat parts, runtime options, replay payloads, or settings that flow into a turn request, inspect all of:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `electron/main/ipc/schemas.ts`
- producer and consumer call sites such as `src/store/app.store.ts`

## Event Replay Contract

When adding or renaming a normalized provider event:

- update `NormalizedProviderEvent` in `src/lib/providers/provider.types.ts`
- update the matching Zod schema in `src/lib/providers/schemas.ts`
- update emitters under `electron/providers/`
- update replay handlers in `src/lib/session/provider-event-replay.ts`
- verify downstream event consumers and tests still handle the event

## Window API Contract

Any change to `window.api` must be checked across:

- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `electron/main/ipc/*`
- renderer call sites under `src/`

## Secondary Run Contract

When changing durable secondary execution, inspect the complete chain:

- shared domain and transport schemas:
  - `src/lib/runs/run-domain.ts`
  - `src/lib/runs/secondary-run.ts`
- renderer orchestration and consumers:
  - `src/store/secondary-run-executor.ts`
  - focused callers such as `src/store/compare-run-judge.ts`
- renderer-to-main bridge:
  - `electron/preload.ts`
  - `src/types/window-api.d.ts`
  - `electron/main/ipc/schemas.ts`
  - `electron/main/ipc/runs.ts`
- durable ownership:
  - `electron/main/runs/secondary-run-coordinator.ts`
  - `electron/persistence/run-ledger-store.ts`
  - `electron/persistence/sqlite-store.ts`
  - restart reconciliation in `electron/main/state.ts`
- host-service and provider execution:
  - `electron/host-service/protocol.ts`
  - `electron/host-service.ts`
  - `electron/providers/secondary-run-executor.ts`
  - `electron/providers/types.ts`
  - `electron/providers/codex-app-server-params.ts`
  - both provider adapters under `electron/providers/`

Keep request and response fields sourced from the shared Zod schemas. The
internal `executionPolicy: "secondary-read-only"` marker must remain
host-owned; do not add it to renderer schemas. Main must await provider
execution and durable transitions, and cancellation must persist before host
abort. Verify idempotent claims, input hashing, stale execution rejection,
receipt ordering, restart interruption, and provider symmetry.

See `docs/architecture/run-core.md` for lifecycle and extension guidance.

## Workspace File Index Contract

The current workspace file list is a path index, not a symbol graph.

Current path:

- `electron/main/utils/filesystem.ts` builds recursive file lists
- `src/lib/fs/electron-fs.adapter.ts` caches `knownFiles`
- `src/store/app.store.ts` stores `projectFiles`
- `src/components/layout/TopBarFileSearch.tsx` and `src/components/ai-elements/prompt-input.tsx` consume the list

Implication:

- file-search improvements can ship without changing provider IPC
- symbol or repo-map work should be treated as a new index layer, not a small tweak to `projectFiles`

## Skill Catalog Contract

When changing local skill discovery:

- `electron/main/utils/skills.ts`
- `electron/main/ipc/skills.ts`
- `electron/preload.ts`
- `src/lib/skills/types.ts`
- `src/lib/skills/catalog.ts`
- settings and prompt input consumers

## PR Status Contract

When changing PR status fetching, derivation, or UI rendering:

- `src/lib/pr-status.ts` — status enum, derivation logic, visual/action config
- `electron/main/ipc/scm.ts` — `scm:get-pr-status`, `scm:set-pr-ready`, `scm:merge-pr`, `scm:update-pr-branch`, `scm:create-pr`
- `electron/preload.ts` — `getPrStatus`, `setPrReady`, `mergePr`, `updatePrBranch`, `createPR`
- `src/types/window-api.d.ts` — type definitions for the PR status and creation methods
- `src/store/app.store.ts` — `workspacePrInfoById`, `fetchWorkspacePrStatus`, `fetchAllWorkspacePrStatuses`
- `src/components/layout/PrStatusIcon.tsx` — icon lookup and color mapping
- `src/components/layout/TopBarOpenPR.tsx` — PR hub trigger, dropdown, creation dialog
- `src/components/layout/ProjectWorkspaceSidebar.tsx` — sidebar icon rendering

See `docs/features/workspace-pr-status.md` for the full architecture reference.

## PR Context Contract

When changing how PR review threads or failed-CI evidence are attached to a task:

- `src/lib/pr-context.ts` — bounds, sanitization, schemas, attachment assembly, staleness
- `electron/host-service/pr-context-runtime.ts` — the `gh` fetch; metadata first, logs only for selected checks
- `electron/host-service/protocol.ts` — `scm.fetch-pr-context-index`, `scm.fetch-pr-check-logs` (request **and** result maps)
- `electron/host-service.ts` — the two dispatch arms
- `electron/main/ipc/schemas.ts` — `FetchPrContextIndexArgsSchema`, `FetchPrCheckLogsArgsSchema`
- `electron/main/ipc/scm.ts` — `scm:fetch-pr-context-index`, `scm:fetch-pr-check-logs`
- `electron/preload.ts` / `src/types/window-api.d.ts` — `fetchPrContextIndex`, `fetchPrCheckLogs`
- `src/components/layout/PrContextDialog.tsx` — the selection UI
- `src/components/session/TaskSourceContextNotice.tsx` — attachment read-out, stale banner, remove
- `src/store/app.store.ts` — withholds stale PR context from the turn

See `docs/features/pr-context-attachment.md` for the full architecture reference.

## Task Supervisor Contract

When changing how a heartbeat wakes an existing task:

- `src/lib/automation/task-supervisor.ts` — schemas, catch-up walk, decision priority, transitions (pure; no clock, no I/O)
- `electron/persistence/task-heartbeat-store.ts` — `task_heartbeats`, `task_heartbeat_occurrences`, the idempotency index
- `electron/host-service/task-supervisor-runtime.ts` — the tick, the serialized operation chain, the boot sweep
- `electron/host-service/local-mcp-runtime.ts` — `getTaskSupervisionSnapshot` (the observation) and `runHeartbeatTurn` (the only executor)
- `electron/host-service/protocol.ts` — `task-supervisor.invoke` (request **and** result maps)
- `electron/host-service.ts` — construction, `start`/`stop`, the dispatch arm
- `electron/main/task-supervisor-service.ts` — the main-process bridge
- `electron/main/stave-mcp-server.ts` — the `stave_*_task_heartbeat` tools

A change to the defer / pause / stop priority order is a change to the
`task-supervisor-safety` gate, and a change to what a heartbeat definition may
contain is a change to the `agent-platform-boundaries` gate. Both are asserted
by name in their tests.

See `docs/features/task-heartbeats.md` for the full architecture reference.

## Project / Workspace Integrity Contract

When changing project selection, workspace hydration, worktree import, notification deep-linking, or task ownership:

- read `docs/architecture/workspace-integrity.md` first
- inspect `src/store/project.utils.ts`
- inspect `src/store/app.store.ts`
- inspect the current consumer surfaces under `src/components/layout/`
- verify default workspace selection is path-aware, not flag-only
- verify rehydrate logic self-heals corrupted current state and persisted registry state
- verify task-scoped git / filesystem actions resolve cwd from task ownership, not from the currently selected workspace
- add or update regressions in `tests/project-utils.test.ts`, `tests/workspace-integrity-regression.test.ts`, and `tests/bridge-persistence-regression.test.ts`

## Minimum Verification

- run `bun run typecheck` after provider or IPC contract changes
- run `bun run check:doc-paths` after changing repository path references in `AGENTS.md`, `CLAUDE.md`, `docs/`, or `skills/`
- if a runtime path changed, smoke-check both Claude and Codex entry flows
