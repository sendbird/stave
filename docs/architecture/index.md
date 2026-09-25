# Architecture Map

This file is the fast entrypoint for codebase orientation.

## Read As Needed

1. Read `AGENTS.md` for repository policy and boundary guardrails.
2. Use `docs/architecture/entrypoints.md` to find the first files for the task.
3. Open only the matching reference: `runtime.md` for process topology,
   `conversation-flow.md` for turn lifecycle, `contracts.md` for a cross-process
   change, or `docs/providers/provider-runtimes.md` for provider behavior.

Other references have narrower triggers: `agent-platform-taxonomy.md` for new
execution, scheduling, delegation, or work-display concepts; `run-core.md` for
durable secondary execution; `workspace-integrity.md` for ownership or
hydration; `chat-message-rendering.md` and `agent-message-ux-catalog.md` for
assistant message presentation; and `session-cursor.md` for provider history
resumption. `code-organization.md` maps recently extracted owners and their
focused tests.

## Top-Level Layout

- `src/` renderer, state, session UI, editor UI
- `electron/` main process, preload bridge, host-service child runtime, provider runtimes, persistence
- `electron/main/stave-*` packaged-app local automation / MCP surface
- `server/` browser-only dev bridge
- `docs/` stable product and architecture reference
- `skills/` repo-local reusable workflows
- `tests/` unit and e2e coverage

## Primary Hotspots

- `src/store/app.store.ts`
  - main renderer-side coordination point
  - read targeted slices instead of the whole file
- `electron/host-service.ts`
  - isolated child runtime router for terminal, provider, workspace scripts, and source control
- `electron/providers/claude-sdk-runtime.ts`
  - Claude turn execution, event normalization, subagent progress
- `electron/providers/codex-app-server-runtime.ts`
  - primary Codex App Server execution path, auth/bootstrap, native plan handling
- `electron/main/ipc/schemas.ts`
  - strict IPC validation boundary
- `src/lib/session/provider-event-replay.ts`
  - normalized event replay into shared chat state
- `src/components/session/ChatPanel.tsx`
  - top-level conversation and assistant message rendering
- `src/lib/pr-status.ts`
  - PR status enum, derivation, icon/color/action config
  - see [Workspace PR Status](../features/workspace-pr-status.md)
- `src/lib/pr-context.ts`
  - bounds, sanitization, and provenance for PR review / failed-CI evidence attached to a task
  - see [PR Context Attachment](../features/pr-context-attachment.md)
- `src/lib/automation/task-supervisor.ts`
  - heartbeat policy: defer to the user, pause with a reason, stop terminally, catch up once
  - see [Task Heartbeats](../features/task-heartbeats.md)

## High-Risk Boundaries

- Renderer must not import Node-only modules directly
- Provider option changes are never local-only; treat them as contract changes
- Secondary execution must cross the main-owned durable run ledger; consumers must not dispatch directly to the host-service
- `NormalizedProviderEvent` and the matching Zod schema must stay in sync
- Project/workspace/task ownership is a hard invariant; never trust default flags or workspace ids without path ownership checks
- Quick orientation work should prefer docs and targeted entrypoints over broad file dumps

## Use This With

- `docs/architecture/entrypoints.md` when you need the first files to inspect
- `docs/architecture/contracts.md` when a change crosses renderer, preload, IPC, and provider runtime
- `docs/architecture/run-core.md` when adding a bounded secondary provider consumer
- `docs/architecture/workspace-integrity.md` when a change touches project shells, worktrees, notifications, or task-owned git actions
