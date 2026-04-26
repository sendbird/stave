## Project / Workspace / Task Shell Redesign

### Goal

Replace the legacy workspace/task shell with a three-part layout:

1. Left sidebar: `Projects > Workspaces`
2. Center top strip: task tabs for the selected workspace
3. Right rail: VS Code-like vertical action strip

### Implemented Layout

- The left project list is full-height and reaches the top edge of the app shell.
- The left sidebar uses theme-reactive gradient artwork behind translucent project and workspace panels instead of a flat fill.
- The left sidebar artwork now supports `Space Haze`, `Wave + Aurora`, and `Gravity Paint`, with `Space Haze` as the default and a selector under `Settings > Design`.
- The top bar now applies only to the main work area, not the left project list.
- The top bar shows the selected workspace path for the current workspace.
- The top bar exposes an always-visible quick-open file search input, and `Cmd/Ctrl+P` focuses it from anywhere outside text inputs.
- Everything below the top bar is now a two-column region: a left workspace column and the right rail.
- The left workspace column contains the selected workspace's task tab strip plus the main chat/editor surface.
- The right rail spans the full region below the top bar, so the task tabs share row width with the rail.
- The `Projects` strip is a flat row aligned to the task-tab height instead of a separate rounded card.
- Below `lg`, the rail remains visible in a compact form and editor or explorer/changes still occupy a dedicated right-side panel column beneath the top bar, so the task tabs and main workspace shrink to make room.

### Confirmed UX Decisions

- Task tabs belong to the selected workspace, not the left project list.
- `Cmd/Ctrl+N` should create a new task in the selected workspace, and `Cmd/Ctrl+W` should archive the currently selected task.
- `Cmd/Ctrl+Shift+1..9` should select the first nine visible workspaces in sidebar order from top to bottom.
- Task tab close should confirm before archiving.
- Project delete removes the project from Stave's list only.
- Workspace rows show a responding indicator if any child task is actively running, including inactive workspaces.
- Workspace rows should show the responding-task count in the trailing action slot, then swap that slot to the workspace shortcut and `Archive` on row hover.
- Workspace hover tooltips should show a compact task-summary preview, with inactive uncached workspaces loading shell data only on first tooltip open.
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
- Project accordion chevrons should stay hidden until project-row hover and appear over the project icon to indicate expand/collapse state.
- Project-row hover actions should reveal `New workspace` and `Project settings`, while project removal lives under Settings > Projects.

### State Model Change

- The active workspace still uses the top-level store fields.
- Inactive workspaces now keep an in-memory runtime cache in `workspaceRuntimeCacheById`.
- Tasks are mapped back to their owning workspace through `taskWorkspaceIdById`.
- Provider stream events are replayed into either the active workspace state or the cached inactive workspace session, depending on task ownership.
- When an inactive workspace stream completes, its session snapshot is persisted.
- Persistence now keeps three workspace read shapes on purpose: full shell for editor/session restore, lite shell for hot merge and existence checks, and summary for sidebar hover/list reads.
- The full shell now externalizes large clean `file:` editor tab bodies into workspace artifacts while keeping dirty and synthetic diff tabs inline, so restore semantics stay intact without forcing every persistence write through one giant JSON blob.
- Workspace restore now prefers an active-tab-first path: the selected editor tab is hydrated immediately, while other clean file tabs can stay metadata-only until the user activates them, avoiding whole-workspace blocking during project or workspace switches.

### Workspace Integrity Warning

> Project root, default workspace id, workspace path, and task ownership must never drift apart.
> A `workspaceDefaultById` flag alone is not a trusted source of truth.
> Any future change in this shell must preserve path-aware default workspace resolution, task-owned cwd resolution, and boot-time self-healing of corrupted project registry entries.

See `docs/architecture/workspace-integrity.md` before changing the shell, hydration flow, notification routing, or task-scoped git actions.

### UI Components

- `ProjectWorkspaceSidebar`
  - renders `recentProjects` plus the current project as a collapsible project tree
  - hosts the Stave app menu in a compact top-left header beside the collapse control
  - can collapse into a narrow rail
  - keeps the top-left header aligned to the same height as the main top bar
  - shows a compact flat `Projects` header with `Open Project` and reorder controls in expanded mode
  - provides `Open Project`, hover-revealed per-project workspace creation, and direct project-settings entry points
  - keeps project order stable instead of re-sorting by recent selection
  - exposes dedicated drag handles for project and workspace reordering only while reorder mode is enabled
  - shows a wave indicator plus the count of responding tasks when any task in that workspace is responding, then swaps that trailing slot to `Archive` on hover for archivable workspaces
  - uses stronger visual emphasis for the selected workspace while keeping project rows neutral
  - lets the sidebar background pattern show through project/workspace containers with restrained liquid-glass translucency
  - keeps workspace hover and selected states slightly stronger than the glass baseline so interaction state stays readable without losing the subdued mood
  - shows project folder icons on project rows and keeps workspace identity icons visible on workspace rows, with gray for the default workspace and deterministic blue tones for named worktrees
  - assigns `Cmd/Ctrl+Shift+1..9` to the first nine visible workspaces in sidebar order and shows those shortcuts in the expanded list plus collapsed-rail tooltips
  - adds compact workspace-summary tooltips that prioritize recent task titles over raw message text, while lazily loading a lightweight workspace shell summary on first hover instead of the full shell payload
- `SettingsDialog`
  - includes a `Projects` section with a dedicated project menu and a single detail panel for the selected project
  - keeps repository workspace defaults, git metadata, scripts config editing, close action, and project removal inside that selected-project panel instead of the main sidebar row
  - exposes `Settings > Design > Sidebar Artwork` so the left sidebar backdrop can switch between `Space Haze`, `Wave + Aurora`, and `Gravity Paint`
  - shows thumbnail previews for each sidebar artwork option so the backdrop modes can be compared before switching
- `WorkspaceTaskTabs`
  - renders active tasks and full-panel CLI sessions as horizontal tabs for the selected workspace
  - uses one shared leading slot for responding wave or model icon
  - keeps docked terminal tabs out of the top strip so the dock stays operationally separate from the task / CLI surface switcher
  - supports drag-and-drop reordering directly in the tab strip for tasks and CLI sessions
  - lets users middle-click task and CLI session tabs to close them through the existing archive / close flows, while leaving managed tasks protected
  - exposes the archive action with confirmation, per-task overflow menu, and workspace-level `Task History`
  - keeps a compact overflow menu for strip-level actions such as `Task History` and showing or hiding the preset bar
  - uses a single icon-only `+` launcher at the far right so `New Task` and `New CLI Session` live in one dropdown, with CLI options still expanding to the provider/context choices
  - keeps the preset bar keyboard-aware, with the first nine presets responding to `Ctrl+1..9` in current list order and a dedicated settings section for managing that order
  - keeps notification deep-links explicit for archived tasks by routing to the owning workspace first, then requiring an explicit restore before the task reopens
- `RightRail`
  - moves the old workspace-bar utility toggles into a vertical strip on the far right
  - labels the git panel as `Source Control`, with `Changes` and `History` kept as the internal tabs inside that panel
  - exposes a dedicated Scripts panel for workspace actions, services, hook inspection, Orbit-enabled dev services, runtime path/status summary, and quick navigation back to project settings
  - exposes a workspace information panel with an auto-updated top `Summary` accordion section that starts expanded, plus shared accordion sections, URL-first linked-resource sections for Jira, Confluence, Figma, Slack, and GitHub, notes, todos, saved plans, and custom structured fields that Muse and local MCP workflows can register against
  - surfaces workspace-level plan history from markdown files under `.stave/context/plans`, while still showing legacy `.stave/plans` files
  - keeps the newest plan first, limits the list to the latest five saved plans, and opens the selected saved plan directly in the editor from the Information panel
  - stays visible at every breakpoint, using a narrower compact treatment below `lg`
  - keeps terminal independent while making editor and explorer/changes mutually exclusive on small widths
  - opens its right-side panels as full-height siblings under the top bar instead of placing them beneath the task-tabs row
  - prefers flat sectioned layouts, divider-separated groups, and compact rows inside right-side panels; avoid stacking card-on-card surfaces unless a summary or isolated workflow genuinely needs stronger containment
- `EditorPanel`
  - loads explorer folders on demand instead of materializing the full tree from `projectFiles`
  - caches loaded directory entries in memory for the active workspace until refresh, workspace switch, or add file/folder invalidation
  - keeps empty folders visible because directory entries now come from folder listings instead of file-only scans
  - presents source control as a tabbed `Changes` / `History` surface with a condensed flat summary header instead of stacking commit history under the working-tree list
  - renders commit history rows in a git-log-inspired timeline layout so per-commit diff drill-in can be added later without redesigning the list
  - renders open file tabs with a stronger two-line filename and directory hierarchy plus diff/conflict state chips, so the strip feels aligned with task tabs without reusing the exact same visual treatment
  - lets users middle-click editor tabs to trigger the existing close flow without adding a separate close affordance

### Store Behavior

- `switchWorkspace()` no longer interrupts live turns.
- The current active workspace is cached before switching away.
- Re-opening a workspace restores the cached runtime session first, then falls back to persisted snapshot data.
- Hot persistence and project-open guards now read the persisted lite shell instead of replaying full editor tab bodies when they only need task/provider merge state.
- Workspace restore uses a dedicated restore shell read instead of the full shell path, so switching projects or workspaces does not eagerly hydrate every clean editor body before the UI becomes interactive.
- Workspace hydration automatically imports branch-backed git worktrees that exist on disk but are missing from Stave's workspace DB.
- `removeProjectFromList()` only removes the project from Stave's recent list and clears associated cached runtime state.
- `moveProjectInList()` and `moveWorkspaceInProjectList()` allow explicit sidebar ordering without auto-reordering on selection.
- `reorderTasks()` persists manual task ordering within the active, archived, or all-task filter views.
- `restoreTask()` re-activates archived tasks from workspace task history.
- Workspace scripts now run from `.stave/scripts.json`, with config editing in `Settings > Projects`, a right-rail runtime panel for actions, services, and hooks, and hook entry points for task creation, task archiving, turn start/completion, PR creation flows, plus legacy workspace triggers for older configs.

### Files Changed

- `src/store/app.store.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/EditorPanel.tsx`
- `src/components/session/ChatArea.tsx`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/WorkspaceTaskTabs.tsx`
- `src/components/layout/RightRail.tsx`
- `src/lib/tasks.ts`
- `package.json`

### Verification Focus

- Workspace switch should not drop live status for inactive workspaces.
- Task archive from tab close should preserve history.
- Project removal should not touch filesystem data.
- Explorer / editor / terminal actions should still work from the right rail.
- Script actions and services should be runnable from the right rail, and PR/workspace lifecycle hooks should execute without blocking unrelated flows unless configured to fail the action.
- Workspace information should persist across workspace switches and app restart.
- On narrow widths, task tabs should stay visible while the compact rail remains pinned and right-side panels reduce the remaining workspace width from the top of the shell.
- Explorer refresh should invalidate cached folder entries and repopulate the currently expanded folders.

### Future Work

- If Jira or Figma integrations become directly callable from the Stave UI layer, upgrade the workspace information cards from URL-derived previews to live remote metadata fetched through those integrations.
