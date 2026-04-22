# Developer Diagnostics

## Render profiler

Stave includes an opt-in React render profiler around the main hot UI surfaces:

- `ProjectWorkspaceSidebar`
- `ChatPanel`
- `ChatInput`
- `EditorPanel`
- `EditorMainPanel`

Enable it in a renderer session with either:

```text
http://127.0.0.1:5173/?staveProfileRenders=1
```

or from DevTools:

```js
localStorage.setItem("stave:render-profiler", "1");
location.reload();
```

When enabled, slow commits are logged to the console and recorded as `performance.measure(...)` entries prefixed with `stave:render:`.

If you are debugging repeated re-renders or `Maximum update depth exceeded`, review [Zustand selector stability](zustand-selector-stability.md) before changing store subscriptions.

## Terminal diagnostics

If you are debugging terminal input loss, session restore bugs, terminal viewport jumps, or dock/CLI surface layout drift, review [Terminal regression prevention](terminal-regression-prevention.md) before changing terminal surface code.

Use that guide as the mandatory check list for:

- `usePtySessionSurface.ts` focus and session lifecycle work
- docked terminal or CLI session shell layout changes
- terminal-related workspace/task switching behavior
- terminal keyboard boundary changes

The terminal backend now runs in a dedicated `host-service` child process. If the dock or CLI terminal surface opens but no live shell appears:

- check main-process logs for `[host-service]` stderr lines
- verify the built desktop app includes `out/main/host-service.js`
- smoke-test the child directly with `node out/main/host-service.js` and confirm it prints `{"type":"ready"}`
- if the child boots but the renderer still shows no output, inspect `electron/main/ipc/terminal.ts` and `electron/main/host-service-client.ts` before changing renderer code

## Provider diagnostics

Provider turn execution now shares the same dedicated `host-service` child process as terminal PTY runtime and workspace scripts. If a chat turn fails before any provider output appears:

- check main-process logs for `[host-service]` stderr lines
- verify the built desktop app includes `out/main/host-service.js`
- smoke-test the child directly with `node out/main/host-service.js` and confirm it prints `{"type":"ready"}`
- inspect `electron/main/ipc/provider.ts`, `electron/main/host-service-client.ts`, and `electron/host-service.ts` before changing renderer store code
- if push-stream events stop only after renderer ownership changes, inspect the owner-routing map in `electron/main/ipc/provider.ts`

## Source control diagnostics

Source control and GitHub PR actions now use the same dedicated `host-service` child process as terminal, workspace scripts, and provider turns. If staging, branching, diff, or PR actions fail before the renderer receives a result:

- check main-process logs for `[host-service]` stderr lines
- verify the built desktop app includes `out/main/host-service.js`
- smoke-test the child directly with `node out/main/host-service.js`, then send an `scm.status` request and confirm a structured response arrives
- inspect `electron/main/ipc/scm.ts`, `electron/main/host-service-client.ts`, `electron/host-service.ts`, and `electron/host-service/scm-runtime.ts` before changing renderer-side source-control UI
- if only GitHub PR actions fail, check `gh auth status` in the target workspace and confirm the host-service cwd matches the expected repository root

## Local MCP diagnostics

The embedded local MCP HTTP server still runs in Electron main, but project registration, workspace creation, task turns, approval/user-input responses, and workspace-information mutations now execute through the dedicated `host-service` child process. If local MCP tools connect successfully but task or workspace operations fail:

- check main-process logs for `[host-service]` stderr lines
- verify the built desktop app includes `out/main/host-service.js`
- smoke-test the child directly with `node out/main/host-service.js`, then send a `local-mcp.invoke` request such as `list-known-projects` and confirm a structured response arrives
- inspect `electron/main/stave-mcp-service.ts`, `electron/main/host-service-client.ts`, `electron/host-service.ts`, and `electron/host-service/local-mcp-runtime.ts` before changing the embedded MCP HTTP server or renderer workspace-information store code
- if workspace-information updates stop reaching the UI while MCP calls still succeed, inspect the `local-mcp.workspace-information-updated` host-service event bridge and the preload subscriber wiring before changing renderer panel code

## Settings diagnostics

The Settings dialog includes desktop-only diagnostics for renderer and compositor troubleshooting:

- `Tooling` shows current workspace sync state against `origin/main` and the native shell / CLI auth status Stave depends on (`git`, `gh`, `claude`, `codex`)
- Claude and Codex tooling diagnostics include the resolved executable path, and Claude also shows the config directory Stave passed to `claude auth status`
- `Settings → Providers → Stave → Local MCP Request Log` shows paginated inbound local MCP requests with latest-page auto-refresh and on-demand payload loading
- `GPU Acceleration` shows Electron-reported hardware acceleration and GPU feature status

The GPU status card is available only when the preload bridge exposes `window.api.window.getGpuStatus()`.
The Tooling section is available only when the preload bridge exposes `window.api.tooling.getStatus()` and `window.api.tooling.syncOriginMain()`.
Tooling status checks and `origin/main` sync now run through the dedicated `host-service` child process, so CLI health and git-sync failures should be debugged from `electron/main/ipc/tooling.ts`, `electron/main/host-service-client.ts`, and `electron/main/utils/tooling-status.ts` before changing renderer settings UI.
