# Stave

Stave is an Electron-based AI coding workspace built with Bun, React, Vite, and TypeScript.

## Highlights

- desktop-first Claude and Codex workspace
- task-oriented chat with approvals, user-input, tools, diffs, and plans
- Session Replay drawer for recent-turn inspection and request snapshots
- `$skill-name` composer selector that resolves installed Claude and Codex skills across global, user, and workspace scopes
- file and image attachments in the composer, including screenshot capture and clipboard image paste with inline preview
- Monaco editor with workspace-backed TypeScript IntelliSense, optional Python LSP support, docked terminal, and source-control actions
- always-visible top-bar quick open for searching workspace files, with `Cmd/Ctrl+P` focusing it
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

- Bun
- Node.js
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

## Desktop packaging

The desktop packaging scripts and `bun run run:desktop:built` now rebuild native Electron modules automatically before bundling or launching the built app. On macOS, `bun run run:desktop:built` now launches the unpacked `Stave.app` bundle so the OS shows the app as `Stave` instead of `Electron`. If your local install gets out of sync after `bun install`, run the rebuild manually:

```bash
bun run rebuild:electron-deps
```

This rebuild now patches `better-sqlite3` in the Electron 41 getter contexts that need `HolderV2()`, then runs `node-gyp rebuild --runtime=electron --build-from-source` for `better-sqlite3` and `node-pty` using the current Electron version and host architecture. Electron headers are cached under `.cache/node-gyp/` in the repo so the rebuild does not depend on a writable home-directory cache.

Useful packaging commands:

```bash
bun run run:desktop:built
bun run package:linux:dir
bun run package:linux:deb
```

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
