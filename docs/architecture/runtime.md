# Runtime Architecture

Stave supports two runtime paths.

## Electron desktop runtime

This is the primary app architecture:

- `src/` renders the React UI
- `electron/preload.ts` exposes the safe `window.api` bridge
- `electron/main.ts` handles window lifecycle, IPC registration, and the host-service bridge
- `electron/host-service.ts` owns isolated terminal, workspace script, provider, source-control, and local MCP task/session execution
- `electron/providers/*` owns Claude SDK, Codex App Server, shared ACP profiles for Cursor and Kiro, and Stave routing execution plus event mapping used by the host-service runtime
- `electron/main/lsp/*` owns optional stdio language-server sessions for Monaco
- `electron/persistence/*` owns SQLite persistence

The renderer does not call provider SDKs or git/PTY subprocesses directly. It sends provider, terminal, source-control, and local MCP task/session requests across the preload bridge, Electron main validates and routes them, and the dedicated `host-service` child process executes the heavy runtime work outside the main-process event loop.

The same host-service runtime is also used for local workspace scripts such as running an optional repo-scoped post-create bootstrap command, creating an optional workspace-local symlink to the repository root `node_modules` when a new git worktree workspace is created, owning the local MCP workspace-session cache plus task-turn persistence used by the embedded automation server, and scheduling Automations while the desktop app is running.

Automation specifications and bounded run history are persisted in SQLite. The host-service scheduler resolves the selected workspace and current persisted Information references, then creates each occurrence through the same local task runtime used by the embedded automation server. Each occurrence remains a normal Stave-owned task conversation rather than a separate result format.

The desktop runtime still hosts the local-only MCP HTTP server in Electron main so same-machine tools can connect without the renderer, but the heavy project/workspace/task/session mutations now execute inside the dedicated `host-service` child runtime.

### Renderer origin and startup

Built desktop runs load the renderer from `stave-app://renderer/index.html`, not `file://`. `electron/main/renderer-protocol.ts` registers that scheme with Chromium's `codeCache` privilege and serves only files inside the built renderer directory (`electron/main/renderer-entry.ts`). Chromium keeps V8 bytecode for such a scheme but not for `file://`, so from the third launch on the renderer bundle starts from cached code instead of being recompiled. `bun run dev:desktop` keeps loading the Vite dev server.

localStorage belongs to an origin, so a profile from a release that loaded `file://` is copied once before the renderer first loads from the scheme (`electron/main/renderer-origin-migration*.ts`). Hidden pages read every `file://` entry, write it at the new origin and read it back; only then does main write `renderer-origin-migration.json` in the user data directory. Until that marker exists the renderer keeps loading from `file://`, so a failed or interrupted copy only delays the switch to a later launch. A profile that had no `stave.sqlite` at startup has nothing to copy and skips the pages. This copy is a temporary migration (see `config/temporary-migrations.json`).

### Code-block highlighting

Chat code blocks are highlighted in a module worker (`src/lib/syntax-highlight.worker.ts`), so Shiki grammar compilation never blocks the renderer's main thread. When a worker cannot start, `src/lib/syntax-highlight-client.ts` highlights on the main thread instead.

## Browser dev runtime

When Stave runs as plain Vite in a browser, there is no Electron preload bridge, IPC, or main process. In that mode, `server/dev-server.ts` provides a local HTTP bridge for provider turns, terminal commands, and source-control actions.

That path is:

- `src/`
- `src/lib/dev-bridge.ts`
- `server/dev-server.ts`

## Packaging notes

`bun run dev:desktop` uses a development profile. Built desktop runs use the production profile. On the first run after the dev/prod split, Stave migrates the old shared `stave.sqlite` database into the development profile and lets the packaged app create a fresh production database.

Production-side automation surfaces must live in `electron/main/*`, not `server/dev-server.ts`, so packaged installs keep working without Bun.
