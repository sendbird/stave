# Tier 3 Plan — Autonomous Background-Task Follow-up

Status: **proposed / not implemented**. This document is the durable design record so
the feature can be picked up later. Tiers 0 and 1 (immediate mitigations) are implemented
separately; this file covers only the larger Tier 3 work.

## Problem

When a Claude turn launches background work (a `Workflow`, a `run_in_background` agent, or a
long-running deep-research task) and then either:

- ends the turn while promising an unprompted follow-up ("I'll notify you automatically when
  it completes and continue"), or
- leaves the turn open (no `done` event) while the background task runs,

Stave cannot deliver the promised behavior:

- If the turn **ends** (`done` fired), nothing on Stave's side watches the background task and
  re-invokes the model, so the "I'll ping you later" message never arrives.
- If the turn **stays open**, the session is locked in a loading spinner and only accepts
  **queued** messages, and the whole thing dies on app restart (orphaned turn).

### Why Claude CLI can do this and Stave cannot

The interactive Claude CLI is a **long-lived process with a persistent agent loop**. Background
tasks post a `<task-notification>` back into that live loop, which re-invokes the model to emit
an autonomous follow-up.

Stave drives the provider **one turn at a time**: user message → `runProviderTurn` → `query()`
→ consume events until the stream closes → emit `done`. There is no persistent, post-turn
re-invocation trigger. See:

- `electron/providers/claude-sdk-runtime.ts` — per-turn `query()`; already supports session
  `resume` (`sessionIdByTask` map + `resume` option in `buildClaudeQueryOptions`).
- `src/store/workspace-turn-replay.ts` — turn is considered complete only on a `done` event
  (and only when no pending tool interaction remains).
- `src/store/app.store.ts` — `activeTurnIdsByTask` gates normal-send vs queue-only.

## Goal

Reach CLI-level parity: a turn may **end** promptly, and when a tracked background task later
completes, Stave **re-invokes the model autonomously** (via session `resume`) to produce a
follow-up turn — surfaced as a normal assistant message in the correct task, without locking
the session into a blocking spinner.

## Key unknown to de-risk FIRST (spike)

**Is background-task completion observable to Stave at all?**

Current evidence suggests background work runs *inside* the SDK/CLI harness and Stave only sees
it as a long-open `query()` stream (hence the "loading" symptom). If so, there is no discrete
"completion event" for Stave to hook, and the naive "resume on completion" model does not
apply. Two possible worlds:

1. **Completion is observable** (SDK emits a distinguishable event, or the background task is a
   Stave-launched process we own) → wire a supervisor + `resume`. Moderate effort.
2. **Completion is internal to the harness** → Stave must **own the background task runtime**
   (launch it outside the query, track its lifecycle itself) before any of this works. Much
   larger effort.

Do a small spike to determine which world we are in before committing to the full build. This
single question dominates the effort estimate.

## Design (assuming world #1, or after re-hosting in world #2)

### Components

1. **Background-task registry** (durable, survives restart)
   - Records `{ taskId, workspaceId, sessionId, backgroundTaskId, launchedAt, status }`.
   - Persisted to disk alongside existing session persistence.

2. **Supervisor** (Electron main process)
   - Watches each registered background task's lifecycle (subscribe or poll).
   - On completion: inject a synthetic `<task-notification>`-style user message and call
     `runProviderTurn` with `query({ resume: sessionId })` to produce the follow-up turn.
   - Emits the follow-up as normal provider events so the existing renderer → preload → IPC →
     replay path renders it unchanged.

3. **Restart reconciliation**
   - On boot, reload the registry.
   - Tasks whose owning process died with the app are marked **lost** and surfaced to the user
     (this is exactly the "workflow `w3s9fogrz` is gone" case) — never left waiting forever.

4. **UI**
   - Represent a running background task as a distinct **non-blocking chip** ("background task
     running"), with the turn ended, so the user is NOT locked into queue-only.
   - Autonomous follow-up appears as a normal message; route by `taskId`, add unread indicator.

### Enabling primitive that already exists

Session `resume` by `sessionId` is already implemented in `claude-sdk-runtime.ts`
(`sessionIdByTask`, `resume`/`resumeSessionAt`/`forkSession` options). Tier 3 is primarily a
**supervisor + registry + re-invocation wiring** problem, not a fundamental rewrite — provided
the spike lands in world #1.

## Risks and required guards

Tier 3 touches the hottest, most race-prone surfaces (the `app.store` turn lifecycle, the
provider runtime, and a long-lived Electron main process). Any implementation MUST include:

### Performance / memory
- **Subprocess accumulation.** `claude-agent-sdk` spawns a `claude` subprocess per query. N
  background tasks + N resume turns = N subprocesses in a long-lived main process. Bound
  concurrency and reap aggressively.
- **Registry / timer leaks.** Poll timers, event subscriptions, `AbortController`s, and
  per-task maps must be torn down on task and workspace deletion. Note the existing
  `sessionIdByTask` only has `delete` on some paths — a new registry needs disciplined
  eviction.
- **Zombie entries.** Never-completing tasks must expire, or they recreate the infinite-loading
  bug in a new location.

### Behavioral / correctness
- **Runaway autonomous loops.** A resumed turn that again launches background work and again
  promises follow-up can recurse forever with no human in the loop → token/cost blow-up.
  Enforce a re-invocation **depth/count/time cap**.
- **Turn-ownership races.** If the supervisor fires a resume while the user has already sent a
  new (queued or normal) message, two drivers hit the same `sessionId` concurrently →
  `sessionIdByTask` clobber, interleaved events, `activeTurnIdsByTask` corruption, broken
  replay. Require a **per-task turn serialization lock/queue**.
- **Replay integrity.** The synthetic follow-up turn's events (`model_resolved`/`text`/`done`)
  must be shaped exactly like a normal turn or `workspace-turn-replay.ts` will duplicate or
  mis-attribute messages, or leave `activeTurnId` dangling. `app.store` is a guardrailed hot
  Zustand surface.
- **Restart ordering.** Boot-time replay of persisted state and supervisor reconciliation must
  be ordered so tasks are not double-fired or dropped.
- **`resume` semantics/cost.** `resume` reloads prior context (token cost per follow-up); a
  compacted/rotated session file may fail or silently start fresh; `forkSession` /
  `resumeSessionAt` can create divergent branches.

### Routing / UX
- Follow-ups may target a task the user is not viewing → route by `taskId` (not "current"),
  add unread indicators, avoid notification spam.

## Multi-file contract surfaces to check (per AGENTS.md)

- Provider/IPC: `electron/providers/types.ts`, `src/lib/providers/provider.types.ts`,
  `src/lib/providers/schemas.ts`, `src/types/window-api.d.ts`, `electron/preload.ts`,
  `electron/main/ipc/schemas.ts`, and call sites in `src/store/app.store.ts`.
- Keep `NormalizedProviderEvent` and `NormalizedProviderEventSchema` in sync.
- Zustand: `docs/developer/zustand-selector-stability.md`,
  `docs/developer/provider-session-stability.md`.

## Recommended sequencing

1. **Spike** the key unknown (is completion observable?). Decide world #1 vs #2.
2. If world #1: build registry + supervisor + `resume` re-invocation **behind a feature flag**,
   with all guards above (per-task lock, depth cap, eviction, boot reconciliation, synthetic-
   turn event shape).
3. If world #2: first re-host background execution so Stave owns the task lifecycle, then #2.

Until Tier 3 ships, Tiers 0 (orphaned-turn recovery) and 1 (behavioral guardrail that stops
Claude from promising unprompted follow-ups) contain the user-visible damage.

## Source references

- Root-cause investigation session (Claude CLI session id): `98e73b14-a2c7-4789-a94a-df1154bb4d76`.
- Related architecture docs: `docs/architecture/runtime.md`, `docs/architecture/conversation-flow.md`.
