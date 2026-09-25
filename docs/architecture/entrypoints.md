# Entrypoints

Use this file when the task starts with "where should I look first?"

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

For Codex cancel/retry races, inspect
`electron/providers/codex-orphan-turn-cleanup.ts` and its runtime call sites.
`codex-turn-notification-gate.ts` filters notifications by the acknowledged
turn; `codex-app-server-pending-request.ts` owns local RPC wait cancellation.

For Codex settings snapshots or the model catalog, start at
`electron/providers/codex-app-server-snapshot.ts` and follow its facade in
`electron/providers/codex-app-server-runtime.ts`. Turn execution remains in the
runtime adapter.

### Sending a conversation turn

1. `src/components/session/ChatInput.tsx` for submission
2. `src/store/app-store-send-user-message.ts` for the send action
3. `src/store/app.store.ts` for the store wiring
4. `docs/architecture/conversation-flow.md` for the full lifecycle

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

1. `src/components/layout/ProjectWorkspaceSidebar.tsx` for shell state, drag and selection wiring
2. `src/components/layout/workspace-sidebar-rows.tsx` for row presentation and row-local behavior
3. `src/components/layout/ProjectWorkspaceSidebar.utils.ts` for pure sidebar decisions
4. `docs/architecture/workspace-integrity.md` when changing workspace ownership or hydration

### Settings content

1. `src/components/layout/settings-dialog-sections.tsx` for section dispatch
2. The matching section under `src/components/layout/settings-sections/`
3. `src/components/layout/settings-dialog.shared.tsx` for shared presentation
4. `tests/settings-controls-a11y.test.tsx` for shared controls and
   `tests/custom-theme.test.ts` for theme data; check the affected section in
   the rendered UI when its layout changes

For Codex settings, `src/components/layout/settings-dialog-codex-section.tsx`
owns snapshot requests, selection, drafts, and mutations. The five tab views
under `src/components/layout/codex-settings/` receive that state and callbacks;
`shared.tsx` contains their presentation helpers.

### Creating and managing a pull request

1. `src/components/layout/TopBarOpenPR.tsx` for draft generation, review,
   verification, commit/push/create sequencing, cancellation, and PR status
2. `src/components/layout/pull-request/CreatePullRequestDialog.tsx` for the
   creation form and `create-pr-dialog-panels.tsx` for its status panels
3. `src/lib/pr-status.ts` for normalized status and available actions
4. `docs/architecture/contracts.md` for the PR bridge and context contracts

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
5. `docs/ui/project-workspace-task-shell.md`

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
- Check tests that mention the same event or type

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
