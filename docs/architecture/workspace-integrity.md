# Workspace Integrity

This is a hard-invariant document, not an implementation note.

If Stave mixes project roots, default workspaces, worktree paths, or task ownership across projects, the app can silently show the wrong tasks, run git commands in the wrong checkout, or corrupt user trust in the shell.

Do not treat this as a cosmetic bug class.

## Never-Regress Rules

- A project's default workspace is owned by that project's root path.
- A default-workspace flag is not enough. The workspace path must still match the current project root.
- `project_registry` and the current in-memory project state must be canonicalized to the same default workspace id, branch, and root path.
- Any workspace id coming from notifications, persisted state, UI actions, or replay payloads must be treated as untrusted until it is confirmed to belong to the active project's workspace list.
- Task-scoped git or filesystem actions must resolve their cwd from the task's owning workspace, not from whichever workspace is currently selected in the UI.
- Rehydration must self-heal corrupted project/workspace mappings and persist the repaired registry back to SQLite.

## Required Check Files

- `src/store/project.utils.ts`
- `src/store/app.store.ts`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/settings-dialog-sections.tsx`
- `src/components/layout/TopBarBranchDropdown.tsx`
- `src/components/layout/TopBarOpenPR.tsx`
- `tests/project-utils.test.ts`
- `tests/workspace-integrity-regression.test.ts`
- `tests/bridge-persistence-regression.test.ts`

## Required Review Questions

When changing project, workspace, task, worktree, hydration, or notification routing logic, answer all of these before merging:

1. Can a foreign project's default workspace id be selected only because `workspaceDefaultById` says `true`?
2. If `workspacePathById` is stale or hostile, does the code still recover the canonical default workspace for the current project root?
3. If localStorage or SQLite contains corrupted project registry data, does boot rehydrate repair it and write the repaired version back?
4. If a notification deep-links to a workspace id, is that id validated against the current project's actual workspace list before switching?
5. If a task belongs to a non-active workspace, do task-scoped git commands still run in the task-owned workspace?
6. If a workspace id is not in `state.workspaces`, do switch / branch / PR-status actions reject it instead of mutating state anyway?

## Minimum Verification

- `bun run typecheck`
- `bun test tests/project-utils.test.ts`
- `bun test tests/workspace-integrity-regression.test.ts`
- `bun test tests/bridge-persistence-regression.test.ts`

If the change touches workspace hydration, project registry loading, or task workspace ownership, do not merge without these checks.
