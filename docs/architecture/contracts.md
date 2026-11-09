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
Replay never rewrites the configured permissions, with one exception: a
re-statement from the same turn, assignment and content hash that carries the
approvals the runtime confirmed once the turn started
(`permission.approvalsConfirmed`, from Codex `approvals_applied`) replaces the
requested approval policy and reviewer; a later re-statement without that
confirmation never takes it back.
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

Codex usage retains optional `ordinaryUsageAllowed` from the full account read.
An explicit permission controls admission independently of displayed percentages;
an unavailable permission keeps the percentage fallback. Credit spend controls
and included-use permission are distinct. Sparse notifications preserve the last
known permission and merge available bucket fields, rather than clearing absent
buckets or nullable metadata. Zero credit budgets have no usage percentage.

Quota observers receive the merged current account snapshot. Host-only
`observedWindowIds` limits persistence to the windows actually reported by a
push; only successful complete reads retire absent windows. A read superseded
by a push must not replace the cache or publish a new full observation, including
when the older read fails. Native cache hits are not new observations.

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

Host-started route classification enters the run's captured account scope before
utility inference, including continuation and restart. Sanitizing utility runtime
options does not remove that scope. Readiness caches and in-flight checks use the
effective provider account as part of their identity.

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
assignment. In a team the helper keeps this cap and draws turns past its held
start turns from the root budget; neither cap is a money limit.

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

`stave_request_agent_resources` uses the current task/stage grant, including
a reply turn of a blocked or stuck stage. A proposal
names a model or effort, a reason (the user's explicit request, a capability
mismatch or mechanical work), a bounded rationale and exact stage-attempt turn
references. The stage's next turn, a supervised turn or an admitted user
reply, checks frozen bounds and fresh cached catalog facts before recording
its acceptance or refusal. A reply also carries the composer's selection
(`runtimeOptions.composerSelection`, dropped at turn entry): its Auto pick is
the turn's automatic proposal, and its model or effort pin is recorded as a
`composer` decision that overrides the route, proposals and frozen pins for
the reply and later turns until a reply without a pin releases it; the
release restores a model or effort frozen at start, and otherwise the run
adapts from the current route. The pin
must be a model of the run's provider in the fresh account catalog when one
is cached; otherwise the reply is refused with that reason. Priority is
composer pin, then explicit request, then automatic proposal. Changes are
limited to two per member Run with two linked turns (supervised turns and
replies) between changes; decisions saved without a linked-turn count fall
back to supervised turns. A user request, and a capability proposal that
raises the model tier or effort, are exempt from both limits; they still count
as changes. Mechanical proposals cannot increase tier or effort. Provider,
account, permissions and completion checks cannot be widened; fixed
model/effort can be replaced only by a composer pin. When a reply runs on
another model than the composer sent, the turn starts with a `model_resolved`
event carrying `agentRunRoute.cause`, and the route line shows it. Linked references and rationale are auditable evidence, not
a measured success probability. No extra classifier/provider call is added.
Fresh account-scoped catalog effort lists override built-in support at initial
root/helper admission, proposal validation, supervised dispatch and replies.
Absent, expired or empty effort lists use built-in support. A newly unsupported
current or pinned effort blocks dispatch before consuming a turn; it is never
silently lowered or counted as an accepted resource change.

Atomic root admission counts parent-plus-child dispatch attempts up to the
root's team turns. A person's stage reply in the root run is not counted; a
delegated run's reply is. Starts that fail or have uncertain delivery are not
refunded. Active and cumulative helper reservations follow the frozen helper
limits (including failed preparation/retries). Reservation and release require
exact root/child/execution identity. A reservation holds at most
`TEAM_LIMITS.helperStartTurns` (2) start turns; each later child attempt draws
one unit from the root budget at dispatch while more than the parent's one
integration turn remains. A child's attempts, its replies included, never
exceed its own `maxTurns`. A child that cannot take another attempt, on a
dispatch or on a reply, stops with `turn-cap-reached`. Unused held turns return on exact settlement; spent attempts
stay spent. A root report predating final helper
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

An Agent-origin Run freezes its team limits at admission and keeps the provider
it started on; saved-Agent supervision keeps its admitted provider. A helper
Agent may run on its own provider unless the parent's model is pinned (always
kept for a Run that froze the version 1 policy). Stage definitions never
acquire provider-switch authority.

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
  The composer shelf's run-start line (`RunStartNotice`) decides with
  `planAgentPromptSendForFit`, the primitive form of `planAgentPromptSend`, and
  `describeRunStartDraft` counts attachments across staged prompt items before
  sending.

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

## Personal Responsibility Contract

Tars's identity and responsibility ownership live outside provider
conversations. Its execution still uses the existing Agent assignment,
Agent run and provider paths:

- `src/lib/tars/types.ts` — strict input schemas, responsibility records,
  snapshot and `TarsBridgeApi`
- `electron/preload.ts` and `src/types/window-api.d.ts` — `window.api.tars`
- `electron/main/ipc/tars.ts` — validates interactive requests before
  forwarding them to the host
- `electron/host-service/protocol.ts` and `electron/host-service.ts` —
  `tars.invoke` request/result maps, awaited dispatch, startup and shutdown
- `src/lib/tars/brief.ts` — the request view's read (`tars:get-brief` →
  `tars.brief`): the user's message and Tars's instruction a unit keeps from
  admission (`request`, `delegatedInstruction`), which `tarsSnapshotForWindow`
  leaves out of every snapshot like `mandate`
- `electron/host-service/tars-runtime.ts` — serialized admission,
  reconciliation and the one `act` control path
- `electron/host-service/tars-control.ts` — deterministic control admission,
  click records (`tars.act`) and the shared request ledger contract
- `electron/host-service/tars-decisions.ts` — saved conversation proposals,
  including `control` actions, admitted through the same runtime path
- `electron/host-service/tars-host.ts` and `tars-execution.ts` —
  registered scope checks, isolated task creation and existing Run integration
- `electron/persistence/tars-store.ts` — durable identity, unique request
  admission, optimistic revision writes and stable execution references
- `electron/persistence/tars-event-inbox.ts`, `src/lib/tars/events.ts` and
  `electron/main/tars-follow-up.ts` — the event inbox and the automatic
  follow-up it may start (see below)
- `src/components/tars/` — renderer mirror and interactive controls
- `src/lib/tars/ownership.ts`, `src/store/tars-snapshot-store.ts` and
  `src/store/tars-owned-control.ts` — which task or run an active
  responsibility holds, the shared last-read snapshot, and the route other
  surfaces' stop and take-over intents take through `act`
- `src/store/agent-run-send.ts` (`cancelAgentRunBeforeStop`) — every turn Stop
  (`abortTaskTurn`) asks it before cancelling the task's agent run

`TarsSnapshot.pendingDecisions` lists the decisions bound to a responsibility
that wait on the user (`TarsPendingDecisionSchema`; rows without `kind` are
proposed controls). `TarsStore.snapshot()` reads the conversation tables on the
same connection:

- `confirm`: `proposed` control receipts, only the newest proposal per
  responsibility whose revision is current, whose responsibility has not ended
  and whose message has no other answered decision. A confirmed or refused
  proposal settles its receipt and leaves the list.
- `unverifiedCompletion`: a responsibility blocked with `unverifiedCompletion`
  until its decision `unverified:<responsibility>:<revision>` is answered or
  the row changes (`messageId`, `actionIndex` and `operation` are null).
- `ask`: an unanswered `ask` receipt of the newest message whose control
  options all target current revisions (`operation` null, `question` and
  `optionCount` for display). A question about no work stays in the
  conversation only.

Fleet (`collectTarsAttention`) turns each into one `tars-decision` row and the
tray counts those rows. Only a `confirm` row carries `tarsDecision` and the
Confirm button; the others offer Open in Tars. An `unverifiedCompletion`
decision speaks for its blocked work, so no `tars-blocked` row repeats it.

### Decision cards and answers

`src/lib/tars/decisions.ts` (`projectTarsDecisions`) projects one decision
shape from messages, receipts, click records, answers, activity and the
snapshot's responsibilities; the conversation card, the short-answer binding,
the answer path and the re-ask scan all read it. A decision binds to its
targets (responsibility id and revision for every control option). It is
`waiting`, `answered`, `invalid` (a target moved past its revision or ended)
or `retired` (a newer proposal, a later message, a sibling answered, or work
settled elsewhere). Without a snapshot a target-bound decision is not offered.

The model's `ask` action (`TarsAskActionSchema`) has a question, 2–4 options
(unique `label` up to 60 characters, one-line `rationale`, `effect`) and an
optional `recommended` index. `effect` is either a `control` on one
responsibility at its `expectedRevision` or `reply`; nothing else parses, and
one reply holds at most one ask. The host settles an ask receipt as `proposed`
without applying anything, or `rejected` with a control reason when an option
could never apply. An ask grants nothing.

`window.api.tars.answer` (`tars:answer`, `TarsAnswerInputSchema`) names a
decision id (`confirm:<message>:<index>`, `ask:<message>:<index>` or
`unverified:<responsibility>:<revision>`), an option index and its `source`
(`click`, `key` or `words`). Main (`createTarsConversationService().answerDecision`)
reads the option from saved state, records the first answer in
`tars_decision_answers` (`TarsDecisionAnswerSchema`) and applies its effect: a
control goes through `tars.act` with request id `answer:<decision>` (a
proposal keeps `confirm:<message>:<index>`, so Fleet and the tray join the same
record) and the answer's source, so admission, revision checks and the
one-transaction outcome are a click's. A reply creates the message
`answer:<decision>` with `origin: { kind: "answer" }`. The same option again
joins the first answer; another option returns `refusal: "alreadyAnswered"`;
a decision that no longer waits returns `notWaiting`; Stave's
"new verification work" option is renderer-only and returns `invalidOption`.
An answer whose host delivery failed stays pending and is retried on its own,
without holding up queued messages. An answer refused for a reason other than
`stale` or `ended` (`isTarsAnswerRetryable`) leaves the decision open; the next
attempt replaces it under `answer:<decision>:<attempt>`. A proposal's
confirmation stays final, since the host settles the proposal with it.
`cancel` and `acceptCompletion` are never a default: the planner drops a
recommendation of them, a proposal for them has no recommended option, and a
short affirmative never binds to them. A short answer binds only to a decision
of the newest message with nothing said after it. Answering a decision retires
the other decisions of its message on the same responsibility only, and
`isCurrentProposal` applies that rule to every confirmation. Typed messages may
not use `answer:` or `reask:` request ids.

The model's `show` action (`TarsShowActionSchema`: `responsibilityId` and
`view`, one of `report`, `changes`, `timeline` or `review`; no other field
parses, and one reply holds at most one show) opens the Tars side view. It is
view-only: the host (`applyTarsDecision`) settles it `applied` when the
responsibility is Tars's (`TarsStore.get`) and `rejected` with reason
`notOwned` otherwise, changes no responsibility, run or task, and does not wake
the queue. A re-ask message's show is refused like any non-ask action. The
renderer opens the side view for each applied show receipt it has not seen
(`selectNewTarsShowRequests`); the first conversation read only records the
receipts already saved, so a reload never replays one. Opening, switching and
closing the side view by click or key are never recorded.

The side view and the tray's Outputs read existing data only; there is no new
IPC. The result report (`projectTarsReport`, `src/lib/tars/report-model.ts`) is
the ended run's `AgentRunReport` from `agent-runs:get`: per criterion its
reported status, or `notReported` for a delegated criterion the report omits,
and its source (`TarsCriterionSource`): the stage whose report decided it, or
the Stave check (stave-check criterion or action-stage script) with its exit
code, scanning back from the furthest stage with a check overriding a report
within a stage, as `collectAcceptanceCriteria` merges them. Evidence is not
per criterion: `evidenceGroups` keep each stage's frozen evidence, labelled by
source (`ClassifiedEvidence.source`) and by the revision it was checked on (a
host check's completed revision, a cited command's source revision, else the
stage report's captured revision) as `current`, `superseded`, `finalUnknown`
or `unknown` against the furthest stage's revision. A run that has not ended has no report.
The review (`projectTarsReview`) is the reviewer stage's latest attempt (the
stage whose `agentConfigId` is `reviewer`). Changes read the execution
workspace through Review's `scm:review-diff` and `scm:review-file-diff`
against the first stage's `startHeadSha`. Outputs (`buildTarsOutputs`,
`src/lib/tars/outputs-model.ts`) list a report once the run ended, changes
when a stage recorded changed paths or a diff count, or recorded its change
as unknown (listed without a count), a review once the
reviewer reported, and the report's links. Tars reads a run Fleet no longer
keeps with `agent-runs:get`, once per responsibility revision.

When a decision Tars made (`confirm` or `ask`) becomes invalid while its
message is still the newest, the conversation service records a
`decisionInvalidated` inbox event and, through the same budget as every other
automatic follow-up, queues one message (at most one per message, not per
decision), `reask:<decision>` with `origin: { kind: "reask", reason, summary }`.
The host refuses every action of such a message except `ask`, and an invalid
decision from it is never asked again. Main wakes the service on the host's
`snapshot` change events.

### Event inbox and automatic follow-up

`tars_events` (`TarsEventSchema`) holds one row per observed change of a
responsibility, keyed by `<kind>:<responsibility>:<episode>`; the episode is
the revision the change produced (for an invalidated decision, its id). A
duplicate delivery returns the saved row; an event whose responsibility moved
to another state or whose `attempt` (run id) is not the current one is saved
`superseded`. `TarsStore.patch` records the event in the same IMMEDIATE
transaction as the change (`classifyTarsTransition`): only a transition counts,
so an unchanged observation or new words in the same state produce nothing.

- Judgment kinds, saved `pending`: `blocked`, `unverifiedCompletion`,
  `verificationFailed` (`incompleteReport` / `staleVerification`),
  `waitExpired` (the host's tick records it once per waiting revision after
  `TARS_WAIT_FOLLOW_UP_MS` without a change) and `decisionInvalidated`.
- Host-settled kinds, saved `settled`: `completed`, and `hostRecovery` when the
  runtime adopts a run whose creation acknowledgement was lost
  (`patch(..., { recovered: true })`).

Main processes pending events only when no user message is queued
(`admitTarsFollowUps`). It reads the decisions projection once, outside the
write lock; if a message arrived since, invalidated decisions wait for the
next pass. Per responsibility, the newest event that still stands
(`isTarsEventCurrent`, and the user has not spoken since) is chosen, the rest
are `coalesced` or `superseded`; paused, taken-over and ended work never stands.
One IMMEDIATE transaction then creates the message
`followup:<event key>` with `origin: { kind: "followUp", eventKey,
responsibilityId, reason, observedRevision, summary }` and settles the event
`followedUp`, so a crash never creates two. Budget: once the automatic
messages (`followUp` and `reask`) since the last user-typed message or chosen
reply reach the saved `maxTurns`, the event is saved `exhausted` and no model
call starts; past `TARS_FOLLOW_UP_WINDOW_CAP` automatic messages in
`TARS_FOLLOW_UP_WINDOW_MS`, events stay `pending` and the service sets one
timer for when the window opens. The count restarts at the user's last action:
a user-typed message or chosen reply, or any row in `tars_action_records`
(clicks, Confirm) or `tars_decision_answers`. Right before the planner call
(`supersedeStale` → `supersedeStaleTarsFollowUp`), a follow-up whose event no
longer stands is cancelled and its event set `superseded`, with no model call.
`applyTarsDecision` refuses, with reason `notByFollowUp` (allowed on every
action kind), a follow-up's `delegate`, pause, takeover, hand-back and
acceptCompletion, any action or ask option on work that is paused, taken
over, cancelled or completed at admission, and accept or cancel where Stave's
unverified-completion card already asks. Resume and cancel stay proposals that
wait for Confirm. The follow-up's context quotes the run's words as
`untrustedObservation`. `TarsEventInbox.prune` removes processed events older
than `TARS_EVENT_RETENTION_MS` (30 days) when the service starts.

`TarsSnapshot.followUps` (`TarsFollowUpStateSchema`, default `[]`) is the
tray's view: `pending`, `deferred` (with `at`, when the window opens),
`following` (its message is queued or reasoning), `exhausted` (until the user
acts) or `nextCheck` (waiting work without a `waitExpired` event for its
revision, only while `at` is ahead; the tray also hides a passed one).
`TarsConversation.events` (optional) carries recent inbox rows, so the
transcript shows an `exhausted` notice where it happened. A later message
does not retire a waiting question when it is a `followUp` about other work
(`projectTarsDecisions`, `readOpenTarsAsks`).

Surfaces never poll. Every Tars store write reports a scope through
`onChange` (`electron/persistence/tars-changes.ts`): `snapshot` for
responsibilities, identity and receipts, `conversation` for messages, settings,
receipts, click records and journaled activity. A batcher reports each scope
once per synchronous write, after the transaction commits. The host emits
`tars.changed`; main (`electron/main/tars-events.ts`) validates it with
`TarsChangedEventSchema` and forwards it, together with its own conversation
writes, to every renderer as `tars:changed`. Preload validates it again and
exposes `window.api.tars.onChanged(listener) => unsubscribe` (optional on
`TarsBridgeApi`, so browser previews without it read on focus).
`useTarsChangeSubscription` (mounted once in `App`) reads the snapshot at start
and on `snapshot` changes, one read in flight plus one trailing read; the
conversation hook does the same on `conversation` changes. Reads take an order
ticket when they start and command results when they are published, so a read
that started earlier never overwrites a newer result.

Status sentences the host writes carry a stable code beside the English text:
`detailCode` / `detailParams` on responsibilities and activity
(`TarsDetailCodeSchema`) and `errorCode` on failed messages
(`TarsMessageFailureCodeSchema`). Surfaces show them through
`describeTarsResponsibilityDetail` and `describeTarsMessageFailure`
(`src/lib/tars/detail.ts`); uncoded text (a run's own reason, another
subsystem's error) is shown as written. The English `detail` stays the model's
context. Tars records its assignments under `tars-<responsibility id>`; the
Agents Work list passes `excludeTars` to `agents:list-assignments` to leave
them out before the limit applies.

The source repository/workspace is immutable after admission. The execution
workspace/task/run are separate stable references, recorded before their next
dependent side effect. A reused request ID with different content is refused.
Controls carry the responsibility revision and may not target another task's
replacement identity. Pausing or cancelling while preparation awaits I/O
invalidates further dispatch, and manual pauses survive host restart.

Pause, resume, cancel, takeover and hand-back have one path. A click
(`window.api.tars.act`, idempotent by `requestId`) and a model-proposed
`control` action both reach the runtime's `act`, which checks the revision
and ownership rules at admission and again at dispatch, controls the run, then
writes the responsibility change and the click record or message receipt in
one immediate transaction. A stale revision, an unknown responsibility, a
resume of taken-over work or any control of ended work settles as a rejected
outcome with a stable `reason` code (`TarsControlReasonSchema`) and an English
`error` diagnostic. The interface translates the code and never shows the
diagnostic; an unrecognized code shows the generic reason. A lock wait stays
pending and retryable. Takeover
uses the run's `taken-over` pause and records `takenOver`; only `handBack`
returns it, within the same admitted scope, and sets `reverifyAfter` so a
completion needs a final verification started after it. There is no direct
state-writing control method.

A click records its `source` (`TarsActSourceSchema`: `click` in Tars, `fleet`
from a Fleet row's control panel, `task` from a task's run line, `key` or
`words` for a decision card answered by key or by a bound short answer); main and
host reject any other value, and the record's wording names the source. Fleet
and the task view resolve ownership from a fresh `tars:get` read before they
act. While a responsibility holds the task or its own run (not completed,
cancelled or taken over), a stop becomes `pause` and a take-over becomes
`takeover`, so the run is never cancelled or its agent released behind the
responsibility. The store's `abortTaskTurn`, which every turn Stop calls,
applies the same rule before it would cancel an agent run
(`cancelAgentRunBeforeStop`): it pauses through `act` with `source: "task"`,
then stops the in-flight turn. On work Tars already paused, a stop sends no
control and stops only the turn. When the pause is refused or cannot be sent,
the run is kept and only a turn the run recorded as the user's own stops. If
ownership cannot be read while the last snapshot or the run's workflow marker
(`tars-<responsibility id>`) shows the work held, the run is kept and the
reason is shown. Ownership is judged by the responsibility's own run: Fleet
and the task view pass the task's active run, so another run on the same task
is never Tars's. The composer's agent picker refuses to record or release an
agent on work Tars holds, since either ends its run.
`abortTaskTurn({ keepAgentRun: true })` stops only the turn for a Fleet
control Tars already answered. Other work keeps the direct path. Answer, approve, steer and queue are not ownership controls and
stay task actions.

A model-proposed `resume`, `handBack` or `cancel` is checked and saved as a
`proposed` receipt; only the user's confirming click (`confirm:<message>:<index>`
request ID, same `act` path, repeating the proposal exactly) applies it, and
that click's outcome settles the proposal in the same transaction. Pause and
takeover apply at once. A hand-back during the final stage always replaces its
started attempt: a running or user-paused run is held first, then the run's
`restartStageAndResume` restarts and resumes it in one transition, so a refused
resume changes nothing. Completion needs a final attempt that started after the
hand-back. Decisions, controls and
responsibility requests have no host request deadline, and main never fences a
control receipt after a failed delivery: it stays pending until the host's
idempotent retry settles the run effect and the receipt together. Such an
unresolved delivery is retried at a capped backoff until the host answers;
later messages wait behind it in order.

A delegate action may name an agent (`agentId`). The conversation settings
carry the saved agents the user allowed (`allowedAgentIds`; built-ins are
always allowed) and an optional execution pin (`executionModel`); both are
copied into each message. Inside the receipt transaction the host
(`src/lib/tars/agents.ts`, `admitTarsAgent`) requires the agent to be active,
allowed both in that message's copy and in the current settings, free of
external-effect stages (`stageHasExternalEffect`; publication needs a separate
request), usable as a delegated task on Claude or Codex, compatible with a
pinned execution model, and within the Tars execution agent's delegation
ceiling (`exceedsDelegateCeiling`). A refusal settles a rejected receipt with a
`TarsDelegateReasonSchema` code that the interface translates. Until the
renderer has synced the saved agents to main and the host, an id that is not a
built-in is neither admitted nor rejected: the message waits unclaimed, or the
receipt stays pending, and the fixed `TARS_AGENT_CATALOG_PENDING_MESSAGE` keeps
it retryable across the host boundary; a sync wakes the queue. When the host
still lacks a catalog main already has (a failed forward), main hands it over
again (`electron/main/agents/agent-host-sync.ts`) before each bounded retry. Publishing
built-ins are also left out of the execution snapshot's "Can call" list.
The renderer's `tars.invoke` create request cannot name an agent. An admitted
agent is recorded on the responsibility, joins only that run snapshot's "Can
call" list and owns its work stage. The planner sees the same admissible list,
bounded in count and text. Without an execution pin the responsibility has no
model: its task starts on Auto and the Run's routing intent is
`autoRouting: true`, so helpers may use the other provider; a pin locks the
model and provider.

Tars grants no publishing action stages at admission. Model instructions
do not replace provider safety controls, and a completion report must not be
presented as a host check or external-service outcome. The service is desktop
hosted; there is no corresponding execution service in the browser dev bridge
or ordinary task Local MCP tool catalog.

Focused coverage: `tests/tars-store.test.ts`,
`tests/tars-runtime.test.ts`, `tests/tars-control.test.ts`,
`tests/tars-agents.test.ts`, `tests/tars-execution-resources.test.ts`,
`tests/tars-ui.test.tsx`, `tests/tars-settings-ui.test.tsx`,
`tests/tars-fleet-control.test.tsx`, `tests/tars-task-stop.test.ts` and
`tests/e2e/tars.e2e.ts`.

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
