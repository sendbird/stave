## Project / Workspace / Task Shell Redesign

### Goal

Replace the current `WorkspaceBar + TaskList` shell with a three-part layout:

1. Left sidebar: `Projects > Workspaces`
2. Center top strip: task tabs for the selected workspace
3. Right rail: VS Code-like vertical action strip

### Implemented Layout

- The left project list is full-height and reaches the top edge of the app shell.
- The top bar now applies only to the main work area, not the left project list.
- The top bar shows the selected workspace path for the current workspace.
- The top bar exposes an always-visible quick-open file search input, and `Cmd/Ctrl+P` focuses it from anywhere outside text inputs.
- The center column contains the top bar, the selected workspace's task tab strip, and the main chat/editor surface.
- The right edge contains a vertical rail for editor, explorer, changes, and terminal toggles.

### Confirmed UX Decisions

- Task tabs belong to the selected workspace, not the left project list.
- `Cmd/Ctrl+N` should create a new task in the selected workspace, and `Cmd/Ctrl+W` should archive the currently selected task.
- Task tab close should confirm before archiving.
- Project delete removes the project from Stave's list only.
- Workspace rows show a responding indicator if any child task is actively running, including inactive workspaces.
- Workspace rows should show the responding-task count alongside the live indicator.
- Default workspace icons should use a neutral gray chip, while non-default worktree icons should use deterministic name-hashed blue accents.
- Project and workspace order should stay stable while navigating.
- Project and workspace order can be adjusted manually from a dedicated sidebar edit mode.
- Task list order should stay stable and support manual drag-and-drop reordering.
- The selected workspace should read as the primary active state, while project rows can stay visually neutral.
- The explorer should lazy-load folder contents, keep empty folders visible, and reuse in-memory directory caches until refresh or structural changes invalidate them.
- `Open Project` should live as a compact icon action in the expanded `Projects` header instead of an inverse-filled CTA.
- The Stave app menu should live in the compact top-left sidebar header instead of the top bar.
- The full project list sidebar should be collapsible.
- The top-left sidebar header should match the main top bar height.
- Project rows should show a dedicated project icon on the far left.
- Project accordion collapse controls should sit on the far right of the row.

### State Model Change

- The active workspace still uses the top-level store fields.
- Inactive workspaces now keep an in-memory runtime cache in `workspaceRuntimeCacheById`.
- Tasks are mapped back to their owning workspace through `taskWorkspaceIdById`.
- Provider stream events are replayed into either the active workspace state or the cached inactive workspace session, depending on task ownership.
- When an inactive workspace stream completes, its session snapshot is persisted.

### UI Components

- `ProjectWorkspaceSidebar`
  - renders `recentProjects` plus the current project as a collapsible project tree
  - hosts the Stave app menu in a compact top-left header beside the collapse control
  - can collapse into a narrow rail
  - keeps the top-left header aligned to the same height as the main top bar
  - shows a compact `Projects` header with `Open Project` and reorder controls in expanded mode
  - provides `Open Project`, project removal, and per-project workspace creation
  - keeps project order stable instead of re-sorting by recent selection
  - exposes dedicated drag handles for project and workspace reordering only while reorder mode is enabled
  - shows a wave indicator plus the count of responding tasks when any task in that workspace is responding
  - uses stronger visual emphasis for the selected workspace while keeping project rows neutral
  - shows project folder icons on project rows and keeps workspace identity icons visible on workspace rows, with gray for the default workspace and deterministic blue tones for named worktrees
  - shows workspace shortcuts in the collapsed rail and includes the parent project name in the tooltip
- `TaskList`
  - preserves the persisted store order instead of auto-sorting by `updatedAt`
  - supports drag-and-drop reordering from a dedicated handle in the expanded list
  - reorders only the tasks visible in the current filter so hidden tasks keep their relative positions
- `WorkspaceTaskTabs`
  - renders active tasks as horizontal tabs for the selected workspace
  - uses one shared leading slot for responding wave or model icon
  - exposes archive close with confirmation, per-task overflow menu, and workspace-level `Task History`
- `RightRail`
  - moves the old workspace-bar utility toggles into a vertical strip on the far right
- `EditorPanel`
  - loads explorer folders on demand instead of materializing the full tree from `projectFiles`
  - caches loaded directory entries in memory for the active workspace until refresh, workspace switch, or add file/folder invalidation
  - keeps empty folders visible because directory entries now come from folder listings instead of file-only scans

### Store Behavior

- `switchWorkspace()` no longer interrupts live turns.
- The current active workspace is cached before switching away.
- Re-opening a workspace restores the cached runtime session first, then falls back to persisted snapshot data.
- Workspace hydration automatically imports branch-backed git worktrees that exist on disk but are missing from Stave's workspace DB.
- `removeProjectFromList()` only removes the project from Stave's recent list and clears associated cached runtime state.
- `moveProjectInList()` and `moveWorkspaceInProjectList()` allow explicit sidebar ordering without auto-reordering on selection.
- `reorderTasks()` persists manual task ordering within the active, archived, or all-task filter views.
- `restoreTask()` re-activates archived tasks from workspace task history.

### Files Changed

- `src/store/app.store.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/EditorPanel.tsx`
- `src/components/session/ChatArea.tsx`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/TaskList.tsx`
- `src/components/layout/TaskItem.tsx`
- `src/components/layout/WorkspaceTaskTabs.tsx`
- `src/components/layout/RightRail.tsx`
- `src/lib/tasks.ts`
- `package.json`

### Verification Focus

- Workspace switch should not drop live status for inactive workspaces.
- Task archive from tab close should preserve history.
- Project removal should not touch filesystem data.
- Explorer / editor / terminal actions should still work from the right rail.
- Explorer refresh should invalidate cached folder entries and repopulate the currently expanded folders.
