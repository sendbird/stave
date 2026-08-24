# Terminal Regression Prevention

This guide explains how Stave should prevent small terminal regressions from repeatedly shipping.

The integrated terminal is not "just another panel". It crosses:

- React rendering
- Zustand subscription boundaries
- browser focus and layout behavior
- terminal renderer runtime behavior (`xterm.js` in the dock, in CLI sessions, and in the Standalone CLI overlay)
- Electron PTY session lifecycle
- workspace shell persistence

That combination makes terminal bugs easy to reintroduce unless ownership and verification stay explicit.

## Core Principle

Treat the integrated terminal as a platform boundary with explicit lifecycle separation between **PTY sessions** (host-service), **I/O transport** (renderer hooks), and **viewport rendering** (the dock and both CLI surfaces on `xterm.js`).

There are three terminal surfaces today: the **dock**, the workspace **CLI session** panel, and the **Standalone CLI** overlay. The last two share `useCliSessionManager.ts` and `useCliTerminalInstance.ts`, so a change to either hook has to be checked against both.

In Stave today, that means:

- `useTerminalSessionManager.ts` owns dock terminal session lifecycle (attach/detach, create/close) and I/O transport
- `useTerminalTabManager.ts` owns dock tab mount/unmount decisions and xterm instance registry
- `useTerminalInstance.ts` owns dock `xterm.js` renderer lifecycle, DOM rendering, resize, and theme sync
- `useCliSessionManager.ts` owns CLI session lifecycle and host snapshot restore
- `useCliTerminalInstance.ts` owns CLI `xterm.js` renderer lifecycle, fit/resize, and focus
- `TerminalSurfacePanel.tsx` owns terminal pane chrome
- `WorkspacePaneHost.tsx` owns pane placement, keep-alive registration, and close routing
- `CliSessionPanel.tsx` owns full-panel CLI session chrome
- `StandaloneCliTerminal.tsx` owns Standalone CLI overlay chrome and its renderer key derivation
- `standalone-cli.store.ts` owns Standalone CLI overlay visibility, active tab, and folder adoption (session teardown on folder change)
- `terminal-surface-styles.ts` owns shared shell-to-terminal inset styling
- `terminal-runtime.ts` (host-service) owns PTY state, slot registry, attach/detach, and output buffering

When that ownership blurs, the same classes of bugs return:

- typing stops working after task or workspace switches
- hidden surfaces spawn or reconnect sessions unexpectedly
- terminal viewport or scroll position jumps
- dock and CLI session surfaces drift apart visually

## Session Lifecycle Model

Stave uses a **surface-specific renderer model on top of a shared attach/detach PTY lifecycle**:

### Within the same workspace

- Dock terminal tabs keep xterm instances alive (`display:none` when hidden)
- CLI session tabs dispose inactive renderers and rebuild them when reactivated
- PTY sessions are detached/reattached through the host contract instead of depending on hidden renderer state
- On CLI restore: attach -> hydrate canonical screen state/backlog -> resume output
- On dock restore: keep-alive renderer + resize/WebGL recovery still applies

### Across workspace or project switches

- Renderer instances are disposed
- PTY sessions are **detached, not killed** (background mode)
- Host-service buffers output in a bounded ring buffer (32MB)
- On return: slot state query -> attach -> screen snapshot/backlog hydration -> push resume
- The host snapshot is the restore source of truth for CLI sessions

### Session destruction (only these cases)

- Explicit tab close
- Workspace deletion (`closeSessionsBySlotPrefix`)
- Project deletion (all workspaces' sessions)
- Standalone CLI folder change (`closeSessionsBySlotPrefix` on the standalone slot prefix; both tabs)
- App quit (`cleanupAll`)

## Required Check Files

| File | Why it matters |
|------|----------------|
| `src/components/layout/useTerminalSessionManager.ts` | Dock session lifecycle, attach/detach, slot reconciliation, I/O transport |
| `src/components/layout/useTerminalTabManager.ts` | Dock tab mount/unmount decisions and xterm instance registry |
| `src/components/layout/useTerminalInstance.ts` | Dock `xterm.js` renderer init, DOM rendering, resize, theme sync |
| `src/components/layout/TerminalTabSurface.tsx` | Dock bridge between terminal renderer instances and tab manager |
| `src/components/layout/useCliSessionManager.ts` | CLI session lifecycle, attach/detach, slot reconciliation, active renderer hydration |
| `src/components/layout/useCliTerminalInstance.ts` | CLI `xterm.js` renderer init, fit/resize, and focus recovery |
| `src/components/layout/pty-session-surface.utils.ts` | Shared pure rules for creation gating |
| `src/components/layout/terminal-surface-styles.ts` | Shared terminal inset/focus styling so dock and CLI surfaces do not diverge |
| `src/components/layout/CliSessionPanel.tsx` | CLI shell, controls, and surface mounting |
| `src/components/layout/standalone-cli/StandaloneCliTerminal.tsx` | Standalone CLI shell and the renderer key that must move with the active tab |
| `src/components/layout/standalone-cli/StandaloneCliOverlay.tsx` | Standalone CLI overlay chrome, mount/unmount gate, and folder reconciliation trigger |
| `src/lib/terminal/standalone-cli.ts` | Standalone CLI identity: sentinel workspace id, tab keys, slot keys, transcript storage key |
| `src/store/standalone-cli.store.ts` | Standalone CLI overlay state, persisted resume ids, and folder-change teardown |
| `src/components/layout/app-shell.shortcuts.ts` | Keyboard boundary between app shortcuts and terminal-native shortcuts |
| `src/components/panes/WorkspacePaneHost.tsx` | Pane placement, terminal keep-alive registration, and surface close routing |
| `src/components/panes/surfaces/TerminalSurfacePanel.tsx` | Terminal pane shell, controls, and surface mounting |
| `src/components/panes/terminal-pane-group.ts` | Pure terminal pane placement and initial group sizing rules |
| `src/store/workspace-session-state.ts` | Workspace restore semantics for active surfaces and shell state |
| `src/store/app.store.ts` | Terminal and CLI tab lifecycle, workspace snapshot persistence, session cleanup on delete |
| `src/lib/terminal/types.ts` | Terminal types, slot key builder (`buildTerminalSessionSlotKey`), session slot state |
| `electron/main/ipc/terminal.ts` | Main-process bridge: IPC handlers, attach registry, push event routing |
| `electron/host-service/terminal-runtime.ts` | PTY session supervisor: create, attach, detach, close, slot state, background buffer, output bounds |
| `src/types/window-api.d.ts` | Terminal IPC contract exposed to the renderer |

## Ownership Rules

### 1. Keep renderer-specific DOM workarounds in one place

Dock renderer DOM behavior belongs in `useTerminalInstance.ts`; CLI renderer fit/focus behavior belongs in `useCliTerminalInstance.ts`. Both surfaces use `xterm.js`, but keep their distinct lifecycle models (dock keep-alive + PTY-first vs CLI dispose-on-hide + fit) separate.

Do not add `querySelector("textarea")`, `contenteditable`, or canvas-child assumptions to shell components or unrelated hooks.

### 2. Keep dock and CLI surface spacing shared

If docked terminal and CLI session surfaces need the same visual inset, focus ring, or terminal padding, encode that once in `terminal-surface-styles.ts` or another shared utility.

Do not let the dock use one padding system while the CLI panel uses another.

### 3. Respect the session lifecycle boundaries

- **Renderer unmount = detach** (not close). PTY stays alive.
- **Tab close = close**. Only explicit tab close kills the PTY.
- **Workspace/project delete = close by prefix**. All sessions for that workspace are killed.
- **Dock visibility hide = keep the renderer alive** (within the same workspace). Use `display:none`.
- **CLI visibility hide = dispose renderer and reattach later**. Do not rely on hidden renderer keep-alive. The Standalone CLI overlay implements this by unmounting its whole subtree when closed.
- **CLI mount node key change = renderer rebuild**. React discards the mount node when its `key` changes, and the renderer hook only rebuilds into the container when `restartToken` changes, so the two must always change together.
- **Dock visibility restore = forced refit/repaint**. Call the renderer-specific recovery path after animation frames: refit if the geometry changed, otherwise `terminal.refresh`.
- **Renderer choice = `xterm.js` on both surfaces.** xterm handles `devicePixelRatio`/zoom changes natively. Do not reintroduce a renderer (e.g. a WASM canvas) that caches the device pixel ratio at construction — that is what made dock text blurry/garbled on zoom and display moves.

Do not move PTY lifecycle decisions into React shell components.

### 4. Preserve the shell/runtime split

`TerminalSurfacePanel.tsx` and `CliSessionPanel.tsx` should describe:

- headers, labels, buttons, badges, error banners, shell layout

`useTerminalSessionManager.ts` and `useCliSessionManager.ts` should describe:

- when a session exists, how it attaches/detaches, how output enters the terminal, how input is flushed

`useTerminalInstance.ts` and `useCliTerminalInstance.ts` should describe:

- renderer init, resize, theme sync, focus, and restore behavior for their surface

When shell components start owning runtime behavior, regressions spread faster.

### 5. Keep terminal keyboard boundaries explicit

App shortcuts and shell shortcuts compete for the same key events. Any terminal change that touches focus or keyboard behavior must verify:

- terminal-native Ctrl shortcuts still reach the PTY
- app-level modifier shortcuts still work where intended
- editable vs terminal vs app-shell boundaries remain clear

### 6. Avoid broad terminal subscriptions

Terminal UI is a hot render surface. Widening a Zustand selector around terminal state causes unnecessary rerenders that can destabilize focus and viewport behavior.

### 7. Use shared helpers for slot keys and batch operations

Slot key format (`surface:workspaceId:tabId`) is defined once in `buildTerminalSessionSlotKey` in `src/lib/terminal/types.ts`. Do not hardcode the format elsewhere.

Batch session operations (close, detach) use the `batchSessionOp` factory in `useTerminalSessionManager.ts`. Do not duplicate the pattern.

## Verification Matrix

Use the lightest layer that proves the behavior, but do not stop too early.

### Unit tests

Use `bun test` for pure or narrowly-scoped logic:

- `tests/pty-session-surface.utils.test.ts`
- `tests/terminal-pane-group.test.ts`
- `tests/terminal-tab-manager.test.ts`
- `tests/terminal-instance.test.ts`
- `tests/terminal-runtime.test.ts`
- `tests/terminal-session-slot-registry.test.ts`

These should cover:

- session creation gating
- focus fallback order
- terminal pane placement and group sizing
- hidden-tab mounting and stale tab-state pruning
- slot reuse and cleanup semantics
- attach/detach state transitions

### Manual desktop smoke

If a change touches real PTY input, focus restore, Electron IPC wiring, or workspace/session restore behavior, run a manual desktop smoke check:

1. Open a CLI session and type `ls`.
2. Switch to a Task in the same workspace and back. Confirm instant restore, no flicker.
3. Switch to another workspace and back. Confirm content restored via backlog.
4. Switch to another project and back. Confirm PTY still alive, content restored.
5. Close a CLI session tab. Confirm PTY is killed (not just detached).
6. Delete a workspace. Confirm all its terminal sessions are killed.
7. Confirm no duplicate sessions appear.
8. Confirm dock and CLI spacing still match the intended shell inset.

## Review Checklist

Before shipping a terminal change, ask:

- Is session lifecycle (attach/detach/create/close) still in `useTerminalSessionManager.ts`?
- Is dock renderer DOM behavior still in `useTerminalInstance.ts`?
- Is CLI xterm renderer behavior still in `useCliTerminalInstance.ts`?
- Did docked terminal and CLI session spacing stay shared?
- Does a hidden CLI surface avoid creating a new session and restore from the host snapshot instead?
- Does the dock still use the dock-specific visibility restore (refit/repaint) path?
- Does the dock still render through `xterm.js` (which handles devicePixelRatio/zoom natively), not a renderer that caches DPR at construction?
- Does unmount call detach (not close)?
- Are slot key strings using `buildTerminalSessionSlotKey` (not hardcoded)?
- Did a store selector widen unnecessarily around the terminal subtree?
- Did I verify both shell layout and actual input behavior?

If any answer is unclear, the change is not done.

## Related Docs

- [Integrated Terminal](../features/integrated-terminal.md)
- [Developer Diagnostics](diagnostics.md)
- [Zustand Selector Stability](zustand-selector-stability.md)
- [Provider Session Stability](provider-session-stability.md)
