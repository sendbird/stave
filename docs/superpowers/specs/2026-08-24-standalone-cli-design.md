# Standalone CLI — Design

**Date:** 2026-08-24
**Status:** Approved for implementation planning
**Supersedes:** the SDK-based scratch session on `feat/independent-claude-codex-cli` (PR #389)

## 1. Summary

Standalone CLI is a floating overlay panel that runs the real `claude` and
`codex` executables in PTY sessions against a single folder configured in
Settings. It requires no registered project and no workspace. Two fixed tabs —
one per provider — are presented like a terminal application.

It replaces the SDK-based scratch session, which solved the same problem one
layer higher: Stave brokered the conversation through `runProviderTurn` and
re-rendered the transcript, approvals, plan mode, and errors itself. Running the
CLI directly hands all of that back to the CLI's own TUI, so the feature ships
with substantially less code and no duplicated interaction surface.

## 2. Goals

- Run Claude Code and Codex against an arbitrary folder with no project
  registration and no workspace.
- Survive project switches, project deletion, and workspace archival.
- Present as a lightweight floating panel reachable from the top bar, available
  even when no project is open.
- Resume conversations across app restarts.

## 3. Non-goals

- Multiple folders, or user-managed tabs. Exactly one folder and exactly two
  tabs. If multi-folder support is wanted later, `WorkspaceCliSessionTab`
  already carries a per-tab `cwd` (`src/lib/terminal/types.ts:16`), so the
  data model does not block it.
- A global keyboard shortcut. Deferred; `appShortcutKeys` is the seam if it is
  added later.
- Stave-rendered approvals, plan mode, or model pickers. The CLI TUI owns them.
- A separate `BrowserWindow`. No such infrastructure exists in the repository.

## 4. Architecture

### 4.1 Session identity: a sentinel workspace id

The host does not validate `workspaceId`. It uses the value only to build the
slot key (`electron/host-service/terminal-runtime.ts:723`), and the zod
schema requires nothing more than a non-empty string
(`electron/main/ipc/schemas.ts:567`). Real workspace ids take exactly four
shapes — `""`, `"base"`, `"base:<hash>"`, `"worktree:<hash>"` — and the hash
alphabet is `[0-9a-z]` (`src/store/project.utils.ts:673`). A sentinel that
is neither of the two literals nor prefixed by them therefore cannot collide,
in either direction, with any real id.

```
workspaceId = "standalone-cli"
tabId       = "claude-code" | "codex"     // provider id doubles as tab id
slot key    = buildTerminalSessionSlotKey({ surface: "cli", workspaceId, tabId })
            = "cli:standalone-cli:claude-code"
tab key     = "standalone-cli:claude-code"
```

Slot keys must be produced through `buildTerminalSessionSlotKey`
(`src/lib/terminal/types.ts:128`), never hardcoded — required by ownership
rule 7 in `docs/developer/terminal-regression-prevention.md:147`.

**This is what makes the isolation structural rather than conventional.**
Workspace archival and project deletion kill sessions by the prefix
`cli:<realWorkspaceId>:` (`src/store/workspace-terminal-cleanup.ts:19`).
That prefix can never match the sentinel, so deleting every project leaves
Standalone CLI sessions running. No new cleanup path is needed, and no existing
one has to learn about this surface.

### 4.2 No host or IPC changes

The existing `CliSessionCreateSessionArgs` contract
(`src/lib/terminal/types.ts:63`) is satisfied entirely by values this surface
already has:

| Field | Value | Effect on the host |
|---|---|---|
| `workspaceId` | `"standalone-cli"` | slot key only |
| `cliSessionTabId` | `"claude-code"` \| `"codex"` | slot key only |
| `cwd` | the configured folder | the real PTY cwd (`terminal-runtime.ts:744`) |
| `workspacePath` | the configured folder | `STAVE_WORKSPACE_PATH` env var only |
| `providerId` | `"claude-code"` \| `"codex"` | selects the executable resolver |
| `contextMode` | `"workspace"` | not read by the host at all |
| `taskId` / `taskTitle` | `null` | `STAVE_TASK_ID` / `STAVE_TASK_TITLE` env vars |
| `nativeSessionId` | persisted value or omitted | `--resume <id>` vs `--session-id <id>` (`terminal-runtime.ts:770`) |
| `runtimeOptions` | `buildCliSessionRuntimeOptions(...)` | binary path overrides |

Consequently **no changes are required** to
`electron/host-service/terminal-runtime.ts`, `electron/main/ipc/terminal.ts`,
`electron/main/ipc/schemas.ts`, or `src/types/window-api.d.ts`.
`shouldCreatePtySession` (`src/components/layout/pty-session-surface.utils.ts:1`)
already passes, because the sentinel is a non-empty string.

### 4.3 Reuse boundary

`useCliSessionManager` is store-free: it holds zero `useAppStore` references and
receives PTY creation itself as an injected `createSession` callback
(`src/components/layout/useCliSessionManager.ts:79`). `useCliTerminalInstance`
and `useTerminalInstance` are likewise store-free. All three are reused
unchanged.

What must be written fresh is the roughly 130 lines of `CliSessionPanel` that
are coupled to the store and the dock: its `useShallow` tuple
(`CliSessionPanel.tsx:68`), the `useAppStore.getState().tasks` read (`:140`),
the `createSession` closure (`:121-172`), `slotKeyForTab` (`:174-182`),
`getTabKey` (`:104-111`), the `activeSurface`-derived visibility (`:99-102`),
the `stave:request-close-cli-session` dispatch (`:479-489`), and the
`workspacePath` precondition (`:128-130`). The remaining ~330 lines of terminal
chrome are portable and should be followed closely rather than reinvented.

### 4.4 State placement

`WorkspaceSessionState` is swapped wholesale on workspace switch
(`src/store/app.store.ts:2753`), so Standalone CLI state cannot live there.
A new independent slice, standalone-cli.store.ts in `src/store/`:

| Field | Purpose |
|---|---|
| `open: boolean` | overlay visibility |
| `activeTabId: "claude-code" \| "codex"` | which tab is shown |
| `nativeSessionIdByTab: Record<tabId, string \| undefined>` | persisted, drives `--resume` |

`open` deliberately does **not** go through `activeAppSurface`. Its existing
members `fleet-view` and `automation-center` *replace* the workspace view
(`src/components/layout/AppShell.tsx:1241`); a floating panel composes over
it instead.

The slice is persisted so `nativeSessionIdByTab` survives restarts. The folder
is not stored here — `settings.standaloneCliFolderPath` is the single source.

### 4.5 Settings

Add `standaloneCliFolderPath: string` to the `AppSettings` interface
(`src/store/app-settings.ts:97`) and to `defaultSettings` as `""` (`:455`).
Persistence is automatic: `partialize` writes the whole `settings` object
(`src/store/app-store-persistence.ts:125`) and rehydration backfills new keys
(`:138`).

The control is a card in the existing General section — a dedicated section is
disproportionate for one field. It pairs a text input with a **Browse…** button
backed by `window.api.fs.pickDirectory`
(`electron/main/ipc/filesystem.ts:72`); this is the first use of a directory
picker from the settings dialog. Register the field in `settingDefinitions`
(`src/components/layout/settings-dialog.registry.ts:70`) with a matching DOM
`id` on its `SettingsCard` so settings search can focus it.

Only absolute paths are accepted. Extract `isAbsolutePosixOrWindowsPath` from
the scratch store into a shared module before deleting that store.

### 4.6 UI surface

A new `standalone-cli` directory under `src/components/layout/`:

```
src/components/layout/
  standalone-cli/
    StandaloneCliOverlay.tsx
    StandaloneCliTabBar.tsx
    StandaloneCliTerminal.tsx
  TopBarStandaloneCli.tsx
```

- **StandaloneCliOverlay** — floating panel, `min(60rem, 92vw)` by
  `min(40rem, 82vh)`, dimmed backdrop, header with folder label and close
  button. Chrome only; no PTY lifecycle decisions (ownership rule 4,
  `terminal-regression-prevention.md:117`). Terminal inset, focus ring, and
  padding come from `terminal-surface-styles.ts` so the dock and this surface
  cannot diverge (ownership rule 2, `:99-103`).
- **StandaloneCliTabBar** — two tabs plus a per-tab restart button.
- **StandaloneCliTerminal** — a **single** instance serving both tabs,
  adapting `useCliTerminalInstance` + `useCliSessionManager`. The hook is already
  generic over a `tabs` array with one `activeTab`, and keys every per-session
  ref and transcript by tab key (`useCliSessionManager.ts:79`), so switching
  tabs is an `activeTab` change rather than a second instance. See §4.7 for why
  splitting into two instances would be a defect.
- **TopBarStandaloneCli** — replaces `TopBarScratchSession` in the top
  bar, ungated by project context.

Folder unset renders an empty state with a button that opens Settings to the
registered field id.

### 4.7 Renderer lifecycle

This surface follows the **CLI model, not the dock model**. The dock keeps xterm
instances alive behind `display:none`; CLI surfaces dispose inactive renderers
and rebuild them on reactivation, restoring from the host snapshot
(`terminal-regression-prevention.md:46`, `:110-111`). Applying dock keep-alive
here is explicitly disallowed.

```
enabled   (renderer built) = open && Boolean(folderPath)
isVisible (PTY attached)   = open && Boolean(folderPath)
activeTab                  = tabs[activeTabId]   // switching disposes + rebuilds
```

Nothing is created until the overlay is opened for the first time, so users who
never touch the feature pay nothing.

Two constraints follow from how the hook stores state:

1. **Use one manager instance, not one per tab.** Each instance loads the whole
   transcript map from localStorage and writes back its own copy
   (`useCliSessionManager.ts:591`), so two instances sharing a storage key
   clobber each other's newer entries. The dock tolerates this because each of
   its panels owns a single tab while sharing
   `stave:cli-session-transcript:v1`. This surface sidesteps it entirely with
   one instance and one key, `stave:standalone-cli-transcript:v1`.
2. **`workspaceId` must prefix every `getTabKey` result.** The removed-tab GC
   and switch-detach effects prefix-match on `` `${workspaceId}:` ``
   (`useCliSessionManager.ts:618`, `:647`). Violating this leaks PTYs silently,
   with no error. `getTabKey: (tab) => `standalone-cli:${tab.id}`` satisfies it.

### 4.8 Keyboard boundary

**The overlay must not close on Escape.** Escape is the cancel key inside the
Claude Code TUI; intercepting it would break the CLI. Closing happens through
the top-bar toggle and the header close button only. Terminal-native control
keys must continue to reach the PTY, per ownership rule 5
(`terminal-regression-prevention.md:133`) — verify against
`src/components/layout/app-shell.shortcuts.ts`.

## 5. Lifecycle matrix

| Event | Behaviour |
|---|---|
| First open | Renderer built, PTY spawned (`useCliSessionManager.ts:749`) |
| Close overlay | Renderer disposed, PTY **detached, not killed**; host slot keeps running and buffering |
| Reopen | Renderer rebuilt, `attachSession` returns `{backlog, screenState}` and the screen is restored |
| Switch tab | Inactive renderer disposed, its PTY detached and alive in background |
| Restart tab | `closeSession` + clear `nativeSessionId` → next boot uses a fresh `--session-id` |
| Folder changed | Close both sessions and clear both `nativeSessionId`s **before** adopting the new path, then reboot. Prevents cross-folder session bleed — the same defect a reviewer found in PR #389 |
| App restart | `nativeSessionIdByTab` is persisted, so both tabs resume via `--resume` |
| Project switch / delete, workspace archive | Untouched. The sentinel prefix cannot match `cli:<realWorkspaceId>:` |
| App quit | `cleanupAll` kills the PTYs like any other session (`terminal-runtime.ts:967`) |

Codex mints its own session id asynchronously; the id arrives through the
`getSessionResumeInfo` poll (500 ms, up to 60 attempts —
`useCliSessionManager.ts:686`, host discovery at `terminal-runtime.ts:118`).
The store must accept a late `nativeSessionId` write, which the injected
`setTabNativeSession` callback already covers.

## 6. Removal

Completed in Task 8: the scratch-session store module, its top-bar trigger
component, its three-file component folder, its five test files, and its
features doc were all deleted. The public docs registry entry was replaced
with one pointing at `docs/features/standalone-cli.md` and
`routePath: "standalone-cli"`.

`isAbsolutePosixOrWindowsPath` was preserved by extracting it to a shared
module first.

## 7. Guardrail compliance

- Slot keys via `buildTerminalSessionSlotKey` only (rule 7).
- Session lifecycle stays inside `useCliSessionManager`; the overlay owns chrome
  only (rule 4).
- CLI renderer behaviour stays in `useCliTerminalInstance` (rule 1).
- Shared spacing via `terminal-surface-styles.ts` (rule 2).
- CLI hide disposes the renderer and restores from the host snapshot (rule 3).
- Escape and terminal-native keys are preserved (rule 5).
- Selectors return no fresh objects, arrays, or fallback containers, per
  `AGENTS.md:163` and rule 6; the two-tab list is a module constant, not a
  selector-derived array.

## 8. Testing

Unit (`bun test`):

- The sentinel prefix does not match any prefix built by
  `closeTerminalSessionsForWorkspaces`, in either direction.
- `getTabKey` output is prefixed by the sentinel for both tabs.
- A single manager instance serves both tabs, and transcripts for both tab keys
  coexist in one storage entry without clobbering.
- Folder change closes both sessions and clears both `nativeSessionId`s before
  the new path is adopted.
- Absolute-path validation; picker cancellation leaves settings unchanged.
- A late `nativeSessionId` write is accepted and drives `--resume` on the next
  boot.
- `createSession` args carry the sentinel, the folder as both `cwd` and
  `workspacePath`, and `taskId: null`.

Component:

- Top-bar trigger renders with no project context.
- Folder unset renders the empty state, not a terminal.
- Closing the overlay disposes the renderer rather than hiding it.

Manual desktop smoke (adapted from `terminal-regression-prevention.md:175`):

1. With no project open, set a folder in Settings, open the overlay, run a
   prompt in each tab.
2. Close and reopen the overlay; confirm the screen is restored from the host
   snapshot, not restarted.
3. Switch tabs and back; confirm no duplicate sessions.
4. Switch projects, then delete a project; confirm both sessions survive.
5. Change the folder; confirm both tabs restart in the new folder with no
   history carried over.
6. Restart the app; confirm both tabs resume the prior conversations.
7. Confirm Escape reaches the CLI and does not close the overlay.
8. Confirm the overlay's terminal inset matches the dock's.

## 9. Risks

- **Two concurrent PTYs.** Each tab holds a live CLI process while the overlay
  has been opened. Acceptable at two, and the reason multi-folder is out of
  scope.
- **Rebuild cost on reopen.** Disposing the renderer means xterm and its WebGL
  context are rebuilt each time the overlay opens. This is the mandated CLI
  model and the host snapshot makes it correct; if it proves visibly slow, the
  fix is snapshot hydration performance, not dock-style keep-alive.
- **First directory picker in Settings.** No precedent in the settings dialog,
  so the interaction pattern is new and should be reviewed for keyboard
  accessibility alongside the existing `DraftInput` fields.
