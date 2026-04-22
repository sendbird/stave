# Runtime Architecture

Stave supports two runtime paths.

## Electron desktop runtime

This is the primary app architecture:

- `src/` renders the React UI
- `electron/preload.ts` exposes the safe `window.api` bridge
- `electron/main.ts` handles window lifecycle, IPC registration, and the host-service bridge
- `electron/host-service.ts` owns isolated terminal, workspace script, provider, source-control, and local MCP task/session execution
- `electron/providers/*` owns Claude, Codex, and Stave routing SDK execution plus event mapping used by the host-service runtime
- `electron/main/lsp/*` owns optional stdio language-server sessions for Monaco
- `electron/persistence/*` owns SQLite persistence

The renderer does not call provider SDKs or git/PTY subprocesses directly. It sends provider, terminal, source-control, and local MCP task/session requests across the preload bridge, Electron main validates and routes them, and the dedicated `host-service` child process executes the heavy runtime work outside the main-process event loop.

The same host-service runtime is also used for local workspace scripts such as running an optional repo-scoped post-create bootstrap command, creating an optional workspace-local symlink to the repository root `node_modules` when a new git worktree workspace is created, and owning the local MCP workspace-session cache plus task-turn persistence used by the embedded automation server.

The desktop runtime still hosts the local-only MCP HTTP server in Electron main so same-machine tools can connect without the renderer, but the heavy project/workspace/task/session mutations now execute inside the dedicated `host-service` child runtime.

## Browser dev runtime

When Stave runs as plain Vite in a browser, there is no Electron preload bridge, IPC, or main process. In that mode, `server/dev-server.ts` provides a local HTTP bridge for provider turns, terminal commands, and source-control actions.

That path is:

- `src/`
- `src/lib/dev-bridge.ts`
- `server/dev-server.ts`

## Packaging notes

`bun run dev:desktop` uses a development profile. Built desktop runs use the production profile. On the first run after the dev/prod split, Stave migrates the old shared `stave.sqlite` database into the development profile and lets the packaged app create a fresh production database.

Production-side automation surfaces must live in `electron/main/*`, not `server/dev-server.ts`, so packaged installs keep working without Bun.
