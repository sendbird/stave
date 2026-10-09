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

## Agent Run Routing Observations

Run-turn preparation propagates an abort signal from the supervisor through
`agent-run-route-host.ts` and `agent-run-route.ts` into Auto classification.
Stop, pause, takeover and Agent release abort read-only preparation before
their serialized transition. Routing or revision reads that ignore cancellation
cannot hold those commands behind them or dispatch a late result. Before a turn
is recorded, the runtime rechecks the persisted event sequence and stage identity,
and rereads active turns and pending attention. A rejected preparation does not
consume a turn or record a provider failure. This does not retry writes or claim
that aborting an already dispatched native turn is synchronous.

Routing observations describe the existing decision; they do not admit execution
or change the user's model, effort, provider-switch or delegation settings.

- `src/lib/routing/agent-run-route.ts` captures bounded, schema-validated
  `AgentRunRouteSelection` facts: decision source, previous and selected route,
  requested effort override and its source. Observation validation failure keeps
  the existing route and leaves its selection facts unknown.
- `electron/host-service/supervision/agent-run-route-host.ts` passes those facts
  to the supervisor, which stores `routeSelection` in the existing keyed
  `turn-started` event through the transactional AgentRun event writer.
- `src/lib/agent-runs/route-observation.ts` projects decisions, exact linked
  turns, their reported usage, and the status of the matching stage attempt.
  Dispatch/outcome keys are the join; proximity in the event list is not one.
  Duplicate events cannot attach or count the same turn twice. A transport
  completion is separate from stage acceptance.
  `attemptStatus` is the current status shared by decisions in that exact
  attempt; it does not attribute acceptance to each turn. `latestInAttempt`
  identifies the latest dispatch decision, including a failed start.
- The host returns optional `routing` through `AgentRunDetail` and ended-run
  reports. The existing `agent-run.invoke` protocol, `agent-runs:get` IPC,
  preload `window.api.agentRuns`, and renderer store carry the shared contract.
  Older hosts may omit it; old or malformed selection detail projects as
  unknown, without rewriting persisted events.

These facts describe selected/requested execution only. The projection does not
claim a native model or effort was confirmed, so `effectiveModel` and
`effectiveEffort` stay null. Per-turn usage is null until a completed turn
reports it; unreported money is null, not zero. Runtime catalog, quota and
availability inputs are explicitly `not-provided` in the current host router.
Only detail/report reads load terminal events for routing observations; usage
aggregation and Insights do not. Missing terminal events remain unknown through
a separate observation reader; the supervisor's existing stop fallback is unchanged.
No additional inference or provider reads run to fill those fields.

Role coverage is a separate lifecycle contract:

| Role / entry | Continuation owner | Completion evidence today |
| --- | --- | --- |
| Assigned primary Agent admitted through the composer | Existing AgentRun supervisor and stage grants | Stage report/action result plus acceptance policy; an ended turn alone is insufficient |
| Assigned primary Agent outside run admission (attachments, unsupported provider, utility/queue paths) | Normal task/turn dispatch | Native turn completion; do not infer an AgentRun acceptance loop from assignment alone |
| Saved Agent used as a delegated task | Omitted lifecycle selects the existing AgentRun supervisor; `task-agent-turn.ts` keeps the frozen `delegate` role | Supervised work requires a matching completed Run report. Explicit `one-turn` settles on provider completion; explicit `detached` waits for parent follow-up. Parent integration/acceptance remains separate |
| In-turn helper | Parent turn and provider-native runtime, limited by `canCall` | Ephemeral returned content for the caller to assess; no independent durable restart/acceptance loop |

Relevant owners include `src/store/agent-run-send.ts`,
`src/lib/agent-runs/agent-run.ts`, `electron/host-service/supervised-turn.ts`,
`electron/host-service/local-mcp-runtime.ts`, `electron/providers/task-agent-turn.ts`,
`electron/main/runs/delegated-task-coordinator.ts` and
`src/lib/agents/native-subagents.ts`. Observation alone does not enable
continuation; supervised delegation is the distinct behavior contract below.

`src/lib/agent-runs/delegated-completion.ts` reads an
exact Run/task/workspace detail and separates accepted completion from running,
waiting, cancelled, stopped and unknown outcomes. Completion requires a matching
completed Run report; native turn termination is insufficient. This pure helper
is used by the main-process supervisor adapter and coordinator. They also
fence the delegation's current execution before applying a result.

### Supervised saved-Agent delegation

`DelegateTaskArgsSchema` preserves omission until normalization: a saved Agent
(`agentConfigId`) defaults to `supervised`, model-only work to `one-turn`.
Explicit `one-turn` and `detached` retain their contracts. The tool schema,
renderer bridge input type, preload and `delegations:create` share this rule.
Workflow stage delegation asks for supervision. A supervised prompt has the
existing Run assignment limit of 8,000 characters; oversized work is refused,
never truncated or downgraded. `maxTurns` accepts 1..30 and defaults to 30 per
assignment outside an opted-in adaptive team. In an adaptive team this cap
is further narrowed by its exact root reservation; neither cap is a money limit.

Before dispatch, the coordinator's accepted receipt records a deterministic
supervisor id for the execution, its cap, frozen Agent hash and resolved
delegation permission. Old rows without that id still use historical numeric
lifecycle inference; their meaning is unchanged. A retry owns a new execution
and supervisor id. The coordinator is the only ledger writer.

Internal `delegated-agent.prepare` creates/reuses an idle managed child with
the frozen parent/provider identity, then persists a paused AgentRun.
`delegated-agent.activate` starts it only after the coordinator confirms the
exact active execution. These main-to-host methods have no renderer IPC or
preload exposure; the public Run start schema rejects delegation authority.
Unacknowledged preparation after restart is interrupted and requires explicit
retry. It cannot automatically replay a dispatch.

Internal `delegated-agent.read` distinguishes an absent persisted supervisor
from a temporarily unavailable host, and reads activation from the full event
history. After restart, absence interrupts the claim for explicit retry;
unavailability defers without guessing completion. Preparation events do not
project a user-facing waiting state while this process still owns admission.

The keyed initial Run event stores an allowlisted, host-resolved delegation
authority snapshot. Every supervised dispatch validates its frozen delegate
assignment and reads the current ledger execution fence. It uses that saved
policy and provider instead of primary user permissions or Auto routing.
Legacy delegates keep their admitted model and effort. Adaptive delegates may
change only resources within the frozen root and member bounds below. Native user replies in the active stage receive the same options.
Their account, CLI path, timeout and session transport choices survive the
authority override; caller tools, permissions and secret bindings do not.
The bounded public `agent-runs:reply` command targets an exact blocked/stuck
delegated AI stage and dispatches through its existing supervisor. The child
composer offers a reply form without taking managed control. A stale reply,
active native turn, pause, missing reporting capability or exhausted turn cap
is refused. Taking over the managed task stops its turn and releases control,
then cancels its delegated Run while the takeover start gate is still held.
A failed release does not preemptively cancel supervision, and retry cannot
silently reclaim an interactive child. Only phase/reason changes write ledger
observations; repeated running or identical waiting observations do not grow
receipts or notify the parent. In-memory sequence watermarks still reject
out-of-order reads, with durable resume receipts protecting restart ordering.
Provider turns retain managed/external control and their parent link. No secret
values, secret bindings, native session ids or browser authority are copied.
Delegate compilation still suppresses recursive native helpers, and the MCP
coordinator refuses delegation from a delegated task.

Child workflows start with empty external-effect consent even under
`when-stuck`. Read-only delegated policy also blocks host action stages after
sign-off; sign-off cannot widen that policy. A user resolves blocked work in
the child task's existing Run controls/replies. Parent follow-up and Detach do
not start unsupervised turns on a supervised child; Stop remains available.

`delegated-agent-run-port.ts` observes `agent-run.changed` and a bounded-frequency
read backstop; it does not schedule turns. The coordinator reconciles exact
Run/task/workspace identity and report, including after reconstruction. It
never falls through to native-turn settlement for a supervised receipt.
Waiting keeps the child active and its writer/concurrency slot reserved.
Resumption records a ledger `started` receipt without dispatch; source event
sequence prevents a late observation regressing the projected phase.
Missing or mismatched evidence stays unresolved. Completed report summaries
are bounded in the normal parent receipts; the parent still owns integration.
Stop cancels the ledger execution, cancels the supervisor, then stops the native
task. Late completion cannot settle a stopped or retried execution.

Focused tests use the real SQLite ledger, assignment compiler and AgentRun
runtime with an injected provider port. They cover multiple turns, permission
symmetry, user replies, limits, reconstruction, preparation races, stale results
and read-only host actions. They do not establish live provider or Electron
process-restart behavior or measured cost/quality improvement.

### Opted-in adaptive resources

A new assigned Claude or Codex Run can enable Balanced from the composer.
Existing Runs stay off. The strict public start payload carries only opt-in and
bounded routing intent. Host-resolved version-1 policy in the keyed start event
freezes provider, account, eligible catalog, Agent/composer pins and limits.
The same event store projects resources; there is no second scheduler or table.

`stave_request_agent_resources` uses the current task/stage grant. A proposal
names a model or effort, capability mismatch or mechanical work, a bounded
rationale and exact stage-attempt turn references. The next supervised turn
checks frozen bounds and fresh cached catalog facts before recording its
acceptance or refusal. Changes are limited to two per member Run with two
supervised turns between changes. Mechanical proposals cannot increase tier or
effort. Fixed model/effort, provider, account, permissions and completion checks
cannot be widened. Linked references and rationale are auditable evidence, not
a measured success probability. No extra classifier/provider call is added.

Atomic root admission counts at most 30 parent-plus-child dispatch attempts,
including stage replies. Starts that fail or have uncertain delivery are not
refunded. At most two saved-Agent supervised helper reservations remain active,
with four cumulative reservations (including failed preparation/retries).
Reservation and release require exact root/child/execution identity. Child
capacity is narrowed by remaining root capacity; one parent integration turn is
protected while children are active. Their unused capacity returns on exact
settlement; spent attempts stay spent. A root report predating final helper
settlement requires a fresh AI integration turn/report. Budget exhaustion leaves
unfinished work stuck or stopped, never accepted. Root cancellation cancels
child supervision and stops its native task; pause prevents child admission.

Helpers inherit the frozen root provider/account/catalog and the union of
root and member pins. Existing canCall, one-level, read-only authority and
writer-worktree rules remain. Other helper lifecycles/model-only consultations
are refused within a budgeted team. The host disables provider-native spawning
(Claude Agent/Task denylist; Codex multi-agent feature flags) on those turns so
opaque helpers cannot consume outside this budget. Ordinary non-adaptive
primary turns retain their native helper behavior.

Quota/catalog observations are reused from normal provider owners, scoped by
provider/account and bounded to five minutes. Missing facts remain unknown;
known quota exhaustion or an unavailable cached model blocks the turn without
silently moving providers/accounts or substituting a pin. Refresh the ordinary
provider state and retry after resolving that block. Billing is reported only
when supplied; turn limits do not guarantee dollars, cost savings or quality.

File-path-only attachments enter supervision as saved on-disk references;
unsaved edits must be saved, and image paths remain image references. Inline
images/rich contexts retain the visible single-turn exception. An idle queued
assignment can start a Run using queue-time routing intent, removing only its
accepted queue identity. Refusal keeps the queued assignment available. Active
Runs, utility work and unsupported providers keep their existing entry behavior.

Legacy Agent-origin Auto can switch providers under its existing settings.
Same-provider freezing applies to opted-in adaptive Runs and saved-Agent
supervision; stage definitions never acquire provider-switch authority.

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
- Streaming source replies are labelled partial in the retrieved context.
  `src/components/task-context-draft-chip.tsx` uses the same selection rules for
  its live partial label; sent chips keep their original display metadata.
  `AgentAttachmentNotice` uses `planAgentPromptSend` and
  `hasAgentPromptAttachments` to explain attachment-triggered single turns
  before sending, including staged prompt items.

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
