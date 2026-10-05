# Contracts

This file is the checklist for changes that cross process or runtime boundaries.

## Provider Turn Contract

When a task touches provider turn payloads, chat parts, runtime options, replay payloads, or settings that flow into a turn request, inspect all of:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `electron/main/ipc/schemas.ts`
- `electron/main/ipc/provider-runtime-schemas.ts` for provider IDs and runtime options
- `electron/main/ipc/provider-conversation-schemas.ts` for conversation payloads and `StreamTurnArgsSchema`
- `src/store/app-store-send-user-message.ts` when the renderer send action is involved
- producer and consumer call sites such as `src/store/app.store.ts`

## Event Replay Contract

Claude SDK translation lives in `electron/providers/claude-event-mapping.ts`,
with rate-limit observation and mutable turn state retained by its runtime
facade. Codex server-request presentation lives in
`electron/providers/codex-server-request-mapping.ts`; the runtime retains
pending-request registration, timeout scheduling, and response handling.
These are provider-specific adapters, not interchangeable protocol mappings.

Tool results identify an earlier tool call with `tool_use_id`. Their normalized
payload does not repeat `ownerAgentId`: renderer replay merges output into the
existing tool part, preserving its owner, and the work-graph reducer updates
the matching work item. Trace both consumers before changing this contract;
the missing owner field on a result alone does not mean attribution was lost.

Codex cancellation can precede the `turn/start` response. An immediate UI
`user_abort` event does not prove that native execution has stopped. Keep
same-thread retries behind `codex-orphan-turn-cleanup.ts` until the matching
native completion arrives; quarantine unresolved threads after the grace
period, including explicit resume attempts. Abandoning a local RPC wait does
not cancel server execution or justify ending other turns on the shared client.
Early notifications must preserve matching current-turn and child-event order
through `codex-turn-notification-gate.ts`.

When adding or renaming a normalized provider event:

- update `NormalizedProviderEvent` in `src/lib/providers/provider.types.ts`
- update the matching Zod schema in `src/lib/providers/schemas.ts`
- update emitters under `electron/providers/`
- update replay handlers in `src/lib/session/provider-event-replay.ts`
- verify downstream event consumers and tests still handle the event

Assigned task turns compile one immutable `AgentAssignment` before provider
execution. A missing assignment means a direct task; an unreadable assignment,
invalid saved configuration, or unavailable mandatory constraint ends with one
failed terminal before native startup. Secondary analysis does not resolve the
task's Agent. Delegated snapshots compile as delegates and retain the host's
resolved delegation permission policy.

`agent_provenance` carries assignment identity, role, content hash, requested
model/effort, allowlisted configured permissions, and instruction delivery facts.
It contains no instruction prose, secret bindings, or environment values.
Native model evidence remains in `model_resolved` and `modelExecution`. Replay
pins identity to the exact Stave turn, preserves it through split rows and SQL
compaction, and never derives missing historical evidence from today's Agent.
Claude and Codex receive instructions each turn. ACP delivers after its actual
session decision; only a confirmed resumed session with the same provider and
Agent version may reuse known delivery. Failed startup and fresh sessions never
consume or infer delivery.

## Window API Contract

Any change to `window.api` must be checked across:

- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `electron/main/ipc/*`
- renderer call sites under `src/`

Quota snapshot responses use `RateLimitsSnapshotResponse` through host protocol,
IPC, preload and the window API. Optional `reads` feedback describes only the
requested provider's actual read outcome and next allowed read times, validated
by `QuotaReadFeedbackSchema` in the usage page. It does not expose native cache
provenance, credentials or runtime options, and is never a persisted quota
observation. Older hosts without feedback leave the read outcome unknown.

## Provider Model Catalog Contract

Runtime model catalogs cross the same process seam as provider turns:

- `src/lib/providers/provider.types.ts` defines the normalized catalog entry
- `electron/providers/provider-model-catalog.ts` routes provider adapters
- `electron/host-service/protocol.ts` and `electron/host-service.ts` transport it
- `electron/main/ipc/schemas.ts` validates the provider and runtime paths
- `electron/preload.ts` and `src/types/window-api.d.ts` expose the bridge
- `src/lib/providers/use-provider-model-catalogs.ts` caches and normalizes the result

Keep provider-specific catalog payloads behind the adapter. The composer must
consume normalized entries and must retain a static fallback when a runtime is
missing or unavailable.

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

## Task Pause And Attachment Contracts

Usage-limit pauses and restored queues share a renderer-owned dispatch gate:

- `src/store/task-work-pause.ts` defines pause state and restart detection.
- `src/store/task-work-pause-wiring.ts` connects normalized turn completion
  and account-guard refusal to the gate.
- `src/store/app-store-task-pause-actions.ts` owns resume and cancellation;
  `src/store/use-usage-limit-auto-resume.ts` drives the renderer timer.
- `src/store/queued-task-turn-dispatch.ts` honours the hold before sending
  through `src/store/app-store-send-user-message.ts`.

The pause is not a new provider event or a persisted scheduled task. Do not
infer account exhaustion from a transient request throttle. Cancellation or
manual resume during a usage read must prevent a second continuation turn.
Keep tests in `tests/usage-limit-stop.test.ts`, `tests/task-work-pause.test.ts`,
`tests/task-work-pause-store.test.ts` and
`tests/queued-task-turn-dispatch.test.ts` aligned with these boundaries.

Task attachments have two separate representations:

- Draft attachment metadata and the sent `task_context` chip are defined in
  `src/types/chat.ts` and validated in `src/lib/task-context/schemas.ts`.
- `src/store/attached-task-context-runtime.ts` reads source messages at send
  time, including attachments in prompt-batch items. Its unloaded-task path
  uses `src/lib/db/workspaces.db.ts`, `src/types/window-api.d.ts`,
  `electron/preload.ts`, `electron/main/ipc/persistence.ts` and the persistence
  store. Keep workspace and task identity together across that read.
- `src/lib/task-context/attached-task-context.ts` assembles bounded retrieved
  context for the normal canonical provider request. The `task_context` chip
  is display only and must remain excluded by
  `src/lib/providers/canonical-request.ts`.

Check `tests/attached-task-context.test.ts` and
`tests/attached-task-context-send.test.ts` for clipping, missing content,
history exclusion and prompt-batch attachment coverage. See
[Conversation Flow](conversation-flow.md#attached-task-context) for the full
path and [Attachments](../features/attachments.md#attach-another-task-as-context)
for the user flow.

Review tasks reuse both contracts and record workspace provenance:

- The renderer starts a review through the existing `delegations:create`
  IPC (`DelegateTaskArgsSchema`) with `access: "read-only"`,
  `lifecycle: "one-turn"`, a same-workspace target and a delegation key
  prefixed `stave-review-`. The host resolves the provider's read-only posture;
  the prompt's read-only wording is not the boundary.
- The finished review's answer is pushed into the reviewed task only as a
  `task-context` draft attachment. `buildDelegatedTaskReceiptsRetrievedContext`
  keeps a review child's identity row but withholds its answer unless the
  draft attaches that child, so a dismissed or ignored review is not pushed
  into a turn and an attached one is not sent twice. This is not an access
  boundary: the agent can still read the child through the delegation list or
  task tools.
- A review task's completion notification keeps the review task as its
  `taskId` (result reviews read it that way) and adds
  `payload.reviewParentTaskId` / `reviewParentTaskTitle`, written by
  `electron/host-service/review-turn-notification.ts`.
  `resolveNotificationOpenTarget` opens the reviewed task from it.
- `stave-review-` keys are reserved (`isReservedDelegationKey` in
  `src/lib/runs/delegated-task.ts`): the agent tool path refuses them, and a
  derived key that would start with the prefix gains a `task-` prefix.
- The skill a review follows is resolved in the renderer and embedded in the
  delegated prompt, because the host's `run-task` path does not resolve `$skill`
  tokens.
- Review claim and completion receipts optionally record bounded host-only
  `WorkspaceRevision` fingerprints. `delegations:review-revision` validates
  the expected child identity and reads the child-owned workspace, comparing
  start, completion and current state. It returns hashes or explicit unknown
  states, never file contents. Old receipts and interrupted completions keep
  unknown provenance; they cannot prove unchanged code. The renderer checks
  on result access, app focus and explicit result refresh, without polling each
  token or timer tick.
- Structured findings are a reply contract, not an IPC one:
  `src/lib/reviews/review-findings.ts` writes the instructions into every
  review prompt and parses the last fenced `stave-review-findings` JSON block
  with Zod, failing safe to "unreadable". A `task-context` attachment and its
  `task_context` display part may carry `findingIds`, and the attachment
  `findingsReplyId` (both validated in `src/lib/task-context/schemas.ts`);
  `buildAttachedTaskSection` then sends only those findings and falls back to
  the latest reply when they cannot be read or the review task has a newer
  reply. Only the block that ends a reply counts; fields are coerced one by
  one, and an unknown severity is kept as major.

Keep `tests/review-task.test.ts` and `tests/review-task-runtime.test.ts`
aligned with these rules.

## Workspace Persistence Ownership Contract

Two writers reach the workspace tables: the renderer (via IPC to main) and
host-service (Local MCP turns, automations, wake-ups). They own different
fields, and the boundary is enforced in code rather than by convention.

Current path:

- `electron/persistence/task-turn-delta.ts` — `HOST_OWNED_WORKSPACE_SHELL_FIELDS`
  and the pure `mergeTaskTurnDeltaPayload` boundary
- `electron/persistence/sqlite-store.ts` — `persistTaskTurnDelta` (host turn
  writes) and `upsertWorkspace` (renderer snapshot writes, legacy migration)
- `electron/host-service/local-mcp-runtime.ts` — `ensureResidentTaskMessages`,
  `persistWorkspaceSession`
- `electron/main/persistence-flush-gate.ts` and `electron/main.ts` — quit flush
- `src/store/workspace-runtime-state.ts` — renderer session cache cap

Ownership:

- host-service writes only `tasks` (never `archivedAt`, which is read from
  disk), `activeTaskId`, `providerSessionByTask`, and `messageCountByTask`,
  plus additive `messages` rows for the turn it is running
- the renderer owns everything else in the shell: prompt drafts, editor,
  terminal and CLI tabs, layout, active surface, pane state, workspace
  information
- main owns migrations, maintenance, and the quit-time flush

Rules:

- a host turn must not call `loadAllTaskMessages`; it reads a bounded tail of
  `MAX_LOADED_TASK_MESSAGES` and trims after applying events
- a host turn writes only the messages an event changed; message persistence
  is additive and never deletes omitted rows
- a host write must not route through `upsertWorkspace` unless
  `persistTaskTurnDelta` declined (missing row or legacy inline payload)
- there is no synchronous renderer→main persistence IPC; quit asks the
  renderer to flush and waits behind a bounded timeout
- the renderer keeps at most `MAX_CACHED_WORKSPACE_SESSIONS` inactive
  workspace sessions resident; eviction is safe because `switchWorkspace`
  flushes before swapping and a cache miss reloads from persistence

Regression coverage lives in `tests/host-persistence-efficiency.test.ts`,
`tests/task-turn-delta.test.ts`, `tests/persistence-flush-gate.test.ts`, and
`tests/workspace-runtime-state.test.ts`; the manifest gate is
`persistence-host-write-boundary` in `config/reliability-gates.json`.

## Local MCP Workspace Information Contract

`electron/host-service/local-mcp-workspace-information.ts` owns validation and
Information transformations for notes, todos, linked resources, custom fields,
and Storybook access. It receives read/update ports from
`electron/host-service/local-mcp-runtime.ts`; it does not own a session cache or
persist directly.

The runtime keeps the public API and the update sequence: refresh the resident
session from persistence, resolve workspace registration, apply the updater,
cache the result, await queued persistence, then notify listeners. Preserve
workspace identity and rejection propagation across this boundary. Project
memory operations remain in the runtime.

## Workspace File Index Contract

The current workspace file list is a path index, not a symbol graph.

Current path:

- `electron/main/utils/filesystem.ts` builds recursive file lists
- `src/lib/fs/electron-fs.adapter.ts` caches `knownFiles`
- `src/store/app.store.ts` stores `projectFiles`
- `src/components/layout/TopBarFileSearch.tsx` and `src/components/ai-elements/prompt-input.tsx` consume the list

Implication:

- file-search improvements can ship without changing provider IPC
- symbol or indexer work should be treated as a new index layer, not a small tweak to `projectFiles`

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
- `src/components/layout/TopBarOpenPR.tsx` — PR hub, async lifecycle, status actions, creation sequencing and cancellation
- `src/components/layout/pull-request/CreatePullRequestDialog.tsx` and `create-pr-dialog-panels.tsx` — creation form and status presentation
- `src/components/layout/RepositoryWorkspaceSidebar.tsx` — sidebar icon rendering

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
- `src/store/app-store-send-user-message.ts` — withholds stale PR context from the turn

See `docs/features/pr-context-attachment.md` for the full architecture reference.

## Task Supervisor Contract

When changing how a wake-up resumes an existing task:

- `src/lib/supervision/wake-up-policy.ts` — schemas, catch-up walk, decision priority, transitions (pure; no clock, no I/O)
- `electron/persistence/wake-up-store.ts` — `wake_ups`, `wake_up_occurrences`, the idempotency index
- `electron/host-service/wake-up-runtime.ts` — the tick, the serialized operation chain, the boot sweep
- `electron/host-service/local-mcp-runtime.ts` — `getTaskSupervisionSnapshot` (the observation)
- `electron/host-service/supervised-turn.ts` — `runSupervisedTurn` (the only executor)
- `electron/host-service/protocol.ts` — `wake-up.invoke` (request **and** result maps)
- `electron/host-service.ts` — construction, `start`/`stop`, the dispatch arm
- `electron/main/wake-up-service.ts` — the main-process bridge
- `electron/main/stave-mcp-server.ts` — the `stave_*_wake_up` tools

A change to the defer / pause / stop priority order is a change to the
`wake-up-safety` gate, and a change to what a wake-up definition may
contain is a change to the `agent-platform-boundaries` gate. Both are asserted
by name in their tests.

See `docs/features/wake-ups.md` for the full architecture reference.

## Tracker Tasks Contract

When changing how tracker tickets are read, cached, or turned into a local run:

- `src/lib/tracker-issues/types.ts` — the normalized ticket, sync status, kickoff link, and every IPC argument schema (pure; the shared vocabulary for both halves)
- `src/lib/tracker-issues/contract.ts` — the `crane-tasks-v1` wire contract the Atelier route is implemented against, plus the row mapper
- `src/lib/jira-connector/types.ts` and `mapping.ts` — the Jira settings document, its public status, and the issue mapper
- `electron/main/atelier-connector/http-client.ts` — `listCraneTasks`, `getCraneTask`, `createCraneTaskJob`
- `electron/main/jira-connector/` — the credential vault, the HTTP client, and the main-process service
- `electron/main/tracker-issues/` — the source adapters, the refresh runtime, the kickoff flow, and the service that wires them to Crane job updates
- `electron/persistence/tracker-issues-store.ts` — `tracker_issues_cache`, `tracker_issue_kickoffs`
- `electron/main/ipc/tracker-issues.ts` and `electron/main/ipc/jira-connector.ts` — the only renderer entry points
- `src/lib/tracker-issues/client-store.ts` — the renderer mirror; filtering, grouping, and sorting stay out of it on purpose
- `src/components/layout/issues/` — the surface

Three invariants hold across that path:

- A tracker credential travels renderer-to-main only. Public status carries account identity at most, never an email, a token, or a connector secret, and the preload bridge exposes no getter. This is the `tracker-credentials-stay-in-main` gate.
- A ticket's own fields are untrusted remote text. A label colour reaches an inline style only through `isSafeCssColor`, a ticket URL is opened by the shell bridge rather than by renderer navigation, and the body reaches a provider only inside the retrieved-context part built by `buildTrackerIssueRetrievedContext`, behind its untrusted-content preamble.
- Crane write-back is opt-in and status-only, and it is impossible for a staged prompt: `TrackerIssueKickoffArgsSchema` refuses `craneWriteBack` unless the source is Crane and the run starts now.

See `docs/features/issues.md` for the user-facing guide.

## Project / Workspace Integrity Contract

When changing project selection, workspace hydration, worktree import, notification deep-linking, or task ownership:

- read `docs/architecture/workspace-integrity.md` first
- inspect `src/store/repository.utils.ts`
- inspect `src/store/app.store.ts`
- inspect the current consumer surfaces under `src/components/layout/`
- verify default workspace selection is path-aware, not flag-only
- verify rehydrate logic self-heals corrupted current state and persisted registry state
- verify task-scoped git / filesystem actions resolve cwd from task ownership, not from the currently selected workspace
- add or update regressions in `tests/repository-utils.test.ts`, `tests/workspace-integrity-regression.test.ts`, and `tests/bridge-persistence-regression.test.ts`

## Minimum Verification

- run `bun run typecheck` after provider or IPC contract changes
- run `bun run check:doc-paths` after changing repository path references in `AGENTS.md`, `CLAUDE.md`, `docs/`, or `skills/`
- if a runtime path changed, smoke-check Claude, Codex, Cursor, and Kiro entry flows
