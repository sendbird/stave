# Entrypoints

Use this file when the task starts with "where should I look first?"

## Request Routing

### Provider runtime behavior

Read in this order:

1. `docs/providers/provider-runtimes.md`
2. `electron/providers/runtime.ts`
3. `electron/providers/claude-sdk-runtime.ts`
4. `electron/providers/codex-app-server-runtime.ts`
5. `electron/providers/codex-sdk-runtime.ts` for rollback-only legacy behavior
6. `electron/main/ipc/schemas.ts`

### Prompt input, skills, and quick controls

Read in this order:

1. `src/components/session/ChatInput.tsx`
2. `src/components/ai-elements/prompt-input.tsx`
3. `src/lib/skills/catalog.ts`
4. `electron/main/utils/skills.ts`
5. `docs/features/skill-selector.md`

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
4. `electron/main/ipc/schemas.ts`
5. matching producer and consumer call sites

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

- Start at `electron/main/ipc/schemas.ts`
- Diff the shared TS type
- Check `window.api` and preload
- Then inspect the provider runtime

## Stave-Specific Search Tips

- `rg "runtimeOptions|provider event|NormalizedProviderEvent" src electron tests`
- `rg "projectFiles|listFiles|TopBarFileSearch|file-search" src electron tests`
- `rg "skillCatalog|refreshSkillCatalog|getActiveSkillTokenMatch" src electron tests`
- `rg "subagent_progress|task_progress|hook_started|agent_id" src electron tests`
