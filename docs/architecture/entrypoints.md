# Entrypoints

Use this file when the task starts with "where should I look first?" Pick the
matching route, then read the owner and the specific boundary the question
crosses. The numbered paths are a map, not a required reading checklist. Use a
targeted `rg` on those paths before listing or searching whole directories.

## Request Routing

### Provider runtime behavior

Read in this order:

1. `docs/providers/provider-runtimes.md`
2. `electron/providers/runtime.ts`
3. The matching adapter: `electron/providers/claude-sdk-runtime.ts` or
   `electron/providers/codex-app-server-runtime.ts`
4. For Claude permissions or user questions, inspect
   `electron/providers/claude-permission-policy.ts` or
   `electron/providers/claude-user-input.ts`
5. If the request crosses IPC, follow the IPC route below

For Claude SDK event translation, use
`electron/providers/claude-event-mapping.ts`. Its runtime facade retains
rate-limit observations and the turn-owned tracker and plan state. For Codex
approval/question presentation, use
`electron/providers/codex-server-request-mapping.ts`; pending requests, timers,
auto-approval, cancellation, and responses stay in the runtime adapter.
When checking what a normalized event does in the UI, continue through
`src/lib/session/provider-event-replay.ts` or
`src/lib/work-graph/work-graph-reducer.ts`. An event's own fields do not by
themselves establish how the consumer associates it with an earlier event.

For Codex cancel/retry races, inspect
`electron/providers/codex-orphan-turn-cleanup.ts` and its runtime call sites.
`codex-turn-notification-gate.ts` filters notifications by the acknowledged
turn; `codex-app-server-pending-request.ts` owns local RPC wait cancellation.

For Codex settings snapshots or the model catalog, start at
`electron/providers/codex-app-server-snapshot.ts` and follow its facade in
`electron/providers/codex-app-server-runtime.ts`. Turn execution remains in the
runtime adapter. Thread start and the GPT-6.1 Sol fallback live in
`electron/providers/codex-ensure-thread.ts`.

### Sending a conversation turn

1. `src/store/app-store-send-user-message.ts` for turn assembly and the send action
2. `src/components/session/ChatInput.tsx` when the submission UI matters
3. `src/store/app.store.ts` when the store wiring matters
4. `docs/architecture/conversation-flow.md` when the full lifecycle matters

For a usage-limit pause or a restored queue, start with
`src/store/task-work-pause-wiring.ts`, then
`src/store/app-store-task-pause-actions.ts` and
`src/store/queued-task-turn-dispatch.ts`. The shelf's controls live in
`src/components/session/composer-shelf/ShelfUsageLimit.tsx` and `ShelfQueue.tsx`.
See [Turn Activity](../features/turn-activity.md#when-a-usage-limit-stops-work)
for reset-time resume and restart behavior.

For tasks attached as context, start with
`src/components/session/use-task-context-mentions.ts`,
`src/store/attached-task-context-runtime.ts` and
`src/lib/task-context/attached-task-context.ts`. Follow the persistence read
and canonical request paths in
[Task Pause And Attachment Contracts](contracts.md#task-pause-and-attachment-contracts).

For a review the composer starts in its own task, start with
`src/components/session/use-review-task-controls.ts` (the Review button) and
`src/store/review-task-runtime.ts`, which builds the prompt and delegation from
`src/lib/reviews/review-task.ts` and calls `window.api.runs.delegateTask`
(`delegations:create` → `electron/main/runs/delegated-task-coordinator.ts`).
The child runs under the read-only delegation posture. Its result returns
through `src/components/session/composer-shelf/use-shelf-reviews.ts` (rows;
**View** reuses `ActivityDetailDialog` with `buildReviewExchange`) as a
`task-context` attachment, which the send path reads like any attached task;
`buildDelegatedTaskReceiptsRetrievedContext` withholds a review child's answer
unless the message attaches it. Start with `tests/review-task.test.ts`
and `tests/review-task-runtime.test.ts`.

For task-attached source material, follow its producer, the shared data or IPC
contract, then the send action that consumes it. PR review and check evidence
uses `src/lib/pr-context.ts` for attachment/provenance rules and
`docs/features/pr-context-attachment.md` for the user flow. Start with
`tests/pr-context.test.ts` for those rules; add the IPC or send-path tests only
when the changed boundary requires them.

### Notifications and persistence

1. `src/store/app-store-notification-runtime.ts` for renderer coordination
2. `electron/persistence/notification-store.ts` for notification rows and cleanup
3. `electron/persistence/sqlite-store.ts` for the persistence facade
4. `tests/notification-store.test.ts` for direct SQL behavior

### Workspace Information panel

1. `src/components/layout/WorkspaceInformationPanel.tsx` for section state and assembly
2. `src/components/layout/workspace-information/workspace-information-link-rows.tsx` for linked resource rows and previews
3. `src/components/layout/workspace-information/workspace-information-custom-fields.tsx` for field inputs
4. `src/components/layout/workspace-information/workspace-information-notes.tsx` for the notes body
5. `src/lib/workspace-information.ts` for data operations

For Local MCP changes to Information, start at
`electron/host-service/local-mcp-workspace-information.ts`. Its public facade in
`electron/host-service/local-mcp-runtime.ts` retains resident sessions, refresh
from persistence, the write queue, and update notifications.

### Project and workspace sidebar

1. `src/components/layout/RepositoryWorkspaceSidebar.tsx` for shell state, drag and selection wiring
2. `src/components/layout/workspace-sidebar-rows.tsx` for row presentation and row-local behavior
3. `src/components/layout/RepositoryWorkspaceSidebar.utils.ts` for pure sidebar decisions
4. `docs/architecture/workspace-integrity.md` when changing workspace ownership or hydration

### Settings content

1. `src/components/layout/settings-dialog-sections.tsx` for section dispatch
2. The matching section under `src/components/layout/settings-sections/`
3. `src/components/layout/settings-dialog.shared.tsx` for shared presentation
4. `tests/settings-controls-a11y.test.tsx` for shared controls and
   `tests/custom-theme.test.ts` for theme data; check the affected section in
   the rendered UI when its layout changes

Codex plugin install and remove lives in
`src/components/layout/settings-dialog-codex-plugins-card.tsx`, rendered in the
Codex tab of `src/components/layout/settings-dialog-providers-section.tsx`.

### Creating and managing a pull request

1. `src/components/layout/TopBarOpenPR.tsx` for draft generation, review,
   verification, commit/push/create sequencing, cancellation, and PR status
2. `src/components/layout/pull-request/CreatePullRequestDialog.tsx` for the
   creation form and `create-pr-dialog-panels.tsx` for its status panels
3. `src/lib/pr-status.ts` for normalized status and available actions
4. `docs/architecture/contracts.md` for the PR bridge and context contracts

### Agent runs and workflows

1. `src/lib/agent-runs/policy.ts` for the pure supervisor decision and
   `src/lib/agent-runs/domain.ts` for agent run state and consent
2. `electron/host-service/supervision/agent-run-runtime.ts` for the host loop
   that starts stage turns, and `agent-run-actions.ts` for the Stave actions
   (draft PR, checks, ready for review)
3. `src/store/agent-runs-store.ts` (the workspace in view) and
   `src/store/fleet-agent-runs-store.ts` (every workspace, notifications) for
   renderer state
4. `src/lib/agent-runs/agent-run.ts` for how an agent's workflow becomes a run,
   and `src/components/agent-runs/` for the status line, panel, sign-off card
   and Fleet strip
5. `src/components/agents/AgentWorkflowField.tsx` (over
   `src/components/workflows/StageList.tsx`) for the agent editor's Workflow
6. `docs/features/agent-runs.md` and `docs/features/agents.md` for the user
   flow

### Agents and assignments

1. `src/lib/agents/schema.ts` for the agent config and its limits,
   `src/lib/agents/compile.ts` for turning a snapshot into runtime options per
   role and provider, and `src/lib/agents/library.ts` for the listed agents
   and custom agent edits
2. `src/lib/agents/import.ts` and `src/lib/agents/repository.ts` for reading
   repository agent files
3. `src/components/layout/KickoffDialog.tsx` and
   `src/store/workspace-kickoff-actions.ts` for starting work as an agent
   (Start now and Create share one start), `assign-runtime.ts` for recording
   the agent and resolving it on every turn of an assigned task, and
   `electron/persistence/agent-assignment-store.ts` for the
   `agent_assignments` records.
   `electron/providers/task-agent-turn.ts` seals one assignment and compiles its
   role before native execution; `src/lib/agents/turn-provenance.ts` validates
   safe per-turn identity and configuration evidence. Replay preserves that
   event through compaction; Run overview shows recorded facts only.
4. `src/components/agents/` for the Agents tab and the flow view in the Task
   panel's Progress tab, with
   `src/lib/agents/flow-view.ts` projecting the flow
5. `docs/features/agents.md` for the user flow and
   `docs/architecture/agent-platform-taxonomy.md` for the vocabulary and
   boundary statements 12–16

### Prompt input, skills, and quick controls

Read in this order:

1. `src/components/session/ChatInput.tsx` for task state and the composer boundary
2. `src/components/session/ChatInputComposer.tsx` for controls and input composition
3. `src/components/session/chat-input.utils.ts` for shared composer decisions
4. `src/components/ai-elements/prompt-input.tsx` for the input primitive
5. For skills, follow `src/lib/skills/catalog.ts`,
   `electron/main/utils/skills.ts`, and `docs/features/skill-selector.md`

### File search, explorer, and workspace indexing

Read in this order:

1. `src/components/layout/TopBarFileSearch.tsx`
2. `src/components/layout/file-search-utils.ts`
3. `src/lib/fs/electron-fs.adapter.ts`
4. `electron/main/utils/filesystem.ts`
5. `docs/ui/repository-workspace-task-shell.md`

### IPC and preload contract changes

Read in this order:

1. `docs/architecture/contracts.md`
2. `src/types/window-api.d.ts`
3. `electron/preload.ts`
4. `electron/main/ipc/schemas.ts` for the public schema entrypoint
5. `electron/main/ipc/provider-runtime-schemas.ts` for provider IDs and runtime options, or `provider-conversation-schemas.ts` for turn payloads
6. matching producer and consumer call sites

### Conversation turn persistence

Read in this order:

1. `docs/architecture/conversation-flow.md`
2. `src/lib/session/provider-event-replay.ts`
3. `src/lib/db/turns.db.ts`
4. `tests/turns-db.test.ts`

## Task Patterns

### "Explain the architecture"

- Start with docs under `docs/architecture/`
- Add only the runtime files that match the user question
- Avoid loading `app.store.ts` until you know which slice matters

### "Find the relevant files"

- Use docs first
- Use `rg` second
- Use broad filesystem scans last

### "Trace this behavior"

- Identify the producer
- Cross the bridge or contract boundary
- Follow the consumer
- Check focused tests for the behavior at the boundary being changed

### "Why did this schema change break runtime?"

- Start at `electron/main/ipc/schemas.ts`, then its matching owner module
- Diff the shared TS type
- Check `window.api` and preload
- Then inspect the provider runtime

## Stave-Specific Search Tips

- `rg "runtimeOptions|provider event|NormalizedProviderEvent" src electron tests`
- `rg "projectFiles|listFiles|TopBarFileSearch|file-search" src electron tests`
- `rg "skillCatalog|refreshSkillCatalog|getActiveSkillTokenMatch" src electron tests`
- `rg "subagent_progress|task_progress|hook_started|agent_id" src electron tests`
