# Stave

Stave is an Electron-based AI coding workspace built with Bun, React, Vite, and TypeScript.

## Highlights

- desktop-first Claude and Codex workspace
- task-oriented chat with approvals, user-input, tools, diffs, and plans
- Session Replay drawer for recent-turn inspection and request snapshots
- `$skill-name` composer selector that resolves installed Claude and Codex skills across global, user, and workspace scopes
- file and image attachments in the composer, including screenshot capture and clipboard image paste with inline preview
- Monaco editor with workspace-backed TypeScript IntelliSense, optional Python LSP support, docked terminal, and source-control actions
- redesigned project, workspace, and task shell with a collapsible project sidebar, workspace task tabs, and a right-side activity rail
- recent-project switching that preserves each project's own workspace list and last active workspace
- automatic import of existing branch-backed git worktrees when a project opens
- optional post-create workspace bootstrap command for new git worktrees, such as `bun install` or `npm install`
- SQLite-backed local persistence for workspaces, tasks, messages, and turns

## Stack

- Bun
- TypeScript
- React 19 + Vite
- Electron + electron-vite
- Tailwind CSS v4
- Monaco Editor
- SQLite via `better-sqlite3`
- Playwright

## Prerequisites

- **Bun** — package manager and script runner
- **Node.js ≥ 20** (Node 22 LTS recommended — see `.nvmrc`). The project pins a version in `.nvmrc`; if you use `nvm` just run `nvm use` after cloning.
- **C++ build toolchain** — required for compiling `better-sqlite3` and `node-pty` native modules:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` (`sudo apt install build-essential`)
  - Windows: Visual Studio Build Tools 2022 with the **Desktop development with C++** workload (VC++ tools) and Python installed. See the [node-gyp Windows docs](https://github.com/nodejs/node-gyp#on-windows) for details. Example with Chocolatey:
    - `choco install visualstudio2022buildtools python --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
- a working `claude` CLI login if you want Claude support
- a working `codex` CLI login if you want Codex support
- `pyright-langserver` or `basedpyright-langserver` on your PATH if you want Python LSP support in the editor

Typical auth commands:

```bash
claude auth login
codex login
```

## Install

```bash
bun install
```

`bun install` automatically runs a `postinstall` hook that patches `better-sqlite3` for Electron 41 compatibility and recompiles both `better-sqlite3` and `node-pty` against the Electron ABI. This is required because these native modules must be compiled for Electron's internal Node runtime, not the host Node version.

If you need to skip the native rebuild (e.g. in a CI environment that only runs web builds), set `SKIP_ELECTRON_REBUILD=1`:

```bash
SKIP_ELECTRON_REBUILD=1 bun install
```

## Development

```bash
# Web renderer only
bun run dev

# Browser renderer + local dev bridge server
bun run dev:all

# Electron desktop app
bun run dev:desktop

# Electron desktop app with polling file watching
bun run dev:desktop:poll
```

## Common scripts

- `bun run typecheck`
- `bun run test`
- `bun run test:e2e`
- `bun run test:ci`
- `bun run build`
- `bun run build:desktop`
- `bun run package:desktop`
- `bun run run:desktop:built`
- `bun run package:linux:dir`
- `bun run package:linux:appimage`
- `bun run package:linux:deb`

## Running the desktop app

The primary way to build and launch Stave locally is:

```bash
bun run run:desktop:built
```

This single command:
1. Recompiles native modules (`better-sqlite3`, `node-pty`) against the Electron ABI
2. Applies the Electron 41 `better-sqlite3` C++ patch (`info.HolderV2()`)
3. Runs `electron-vite build` to produce the production bundle
4. Launches the app:
   - **macOS** — packages with `electron-builder --dir` and opens `Stave.app` so the OS titlebar shows "Stave" instead of "Electron"
   - **Linux / Windows** — runs `electron .` with `STAVE_RUNTIME_PROFILE=production`

## Desktop packaging

### Why native modules need rebuilding

`better-sqlite3` and `node-pty` are C++ native modules. When you run `bun install`, they are compiled for the **host Node.js** ABI. Electron bundles its **own Node.js runtime** with a different ABI, so the modules must be recompiled for Electron specifically. Additionally, Electron 41 changed how V8 `PropertyCallbackInfo` works in getter callbacks, requiring a source-level patch to `better-sqlite3` (`info.This()` → `info.HolderV2()`) before the C++ is compiled.

All of this is handled automatically by `postinstall` and by each packaging/run script. You should not need to think about it in normal development.

### Manual rebuild

If you reinstall packages with `--ignore-scripts`, or if your native modules become out of sync for any reason, rebuild manually:

```bash
bun run rebuild:electron-deps
```

The rebuild reads the **actual installed Electron version** from `node_modules/electron/package.json`, so the compiled ABI always matches what is on disk — regardless of semver ranges in `package.json`. Electron headers are cached under `.cache/node-gyp/` inside the repo so the rebuild does not depend on a writable home-directory cache.

### Packaging commands

```bash
# Build and run locally (primary workflow)
bun run run:desktop:built

# Package as unpacked directory
bun run package:desktop

# Linux targets
bun run package:linux:dir
bun run package:linux:appimage
bun run package:linux:deb
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `NODE_MODULE_VERSION` mismatch on launch | Native modules compiled for host Node, not Electron | `bun run rebuild:electron-deps` |
| App crashes or freezes on first persist | Electron 41 `HolderV2` patch not applied | `bun run rebuild:electron-deps` |
| `[persistence] upsert-workspace-sync failed` in Electron logs | Same as above, check the full error message | `bun run rebuild:electron-deps` |
| `Patch signature not found` error during rebuild | `better-sqlite3` version changed or `node_modules` corrupted | `bun install && bun run rebuild:electron-deps` |
| Build fails with `node-gyp` errors | Missing C++ toolchain | Install Xcode CLT / build-essential (see Prerequisites) |

## Docs

Stable project documentation now lives under `docs/`.

- [Documentation index](docs/README.md)
- [Runtime architecture](docs/architecture/runtime.md)
- [Conversation flow](docs/architecture/conversation-flow.md)
- [Provider runtimes](docs/providers/provider-runtimes.md)
- [Future SDK backlog](docs/future/claude-sdk-candidates.md)
- [Shared skill management plan (2026-03-13)](docs/future/shared-skill-management-plan-2026-03-13.md)
- [Session Replay](docs/features/session-replay.md)
- [Skill selector](docs/features/skill-selector.md)
- [Attachments](docs/features/attachments.md)
- [Language intelligence](docs/features/language-intelligence.md)
- [Developer diagnostics](docs/developer/diagnostics.md)
- [shadcn preset](docs/ui/shadcn-preset.md)
- [Project / workspace / task shell redesign](docs/ui/project-workspace-task-shell.md)

## Project structure

- `src/` renderer app, Zustand store, chat UI, editor UI, and client bridges
- `electron/` Electron main process, preload bridge, provider runtimes, persistence
- `server/` browser-only dev bridge server
- `docs/` stable product and architecture documentation
- `tests/` unit and E2E coverage
- `public/` static assets and provider logos
