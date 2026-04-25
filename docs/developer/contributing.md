# Developer and Contributing Guide

This guide is for building Stave locally or contributing changes. If you want to install and use the app, start with the root [README](../../README.md) and the [Install Guide](../install-guide.md).

## Before You Start

- Read [AGENTS.md](../../AGENTS.md) first. It contains repo-specific workflow rules, guardrails, and contribution constraints.
- Runtime: **Bun**
- Node.js: **>= 20**. Node 22 LTS is recommended, and the repo pins a version in `.nvmrc`.
- Native build toolchain:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`
  - Windows: Visual Studio Build Tools 2022 with the Desktop development with C++ workload and Python
- Optional provider setup:
  - `claude auth login`
  - `codex login`
- Optional language servers:
  - `typescript-language-server` for TypeScript and JavaScript LSP support
  - `pyright-langserver` or `basedpyright-langserver` for Python LSP support

## Core Stack

- Bun
- TypeScript
- React 19 + Vite
- Electron + electron-vite
- Tailwind CSS v4
- Monaco Editor
- SQLite via `better-sqlite3`
- Playwright

## Install Dependencies

```bash
bun install
```

`bun install` automatically runs a `postinstall` hook that patches `better-sqlite3` for Electron 41 compatibility and rebuilds both `better-sqlite3` and `node-pty` against Electron's ABI.

If you need a web-only install that skips the native Electron rebuild step, use:

```bash
SKIP_ELECTRON_REBUILD=1 bun install
```

## Run Stave Locally

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

## Validate Changes

Use the smallest relevant check set for the change, then run the full gate before opening a PR when appropriate.

- `bun run typecheck`
- `bun test`
- `bun run build`
- `bun run build:desktop`
- `bun run test:ci`

## Packaged Desktop Runs And Packaging

Primary local packaged run:

```bash
bun run run:desktop:packaged
```

Packaged run with a timestamped log file:

```bash
bun run run:desktop:packaged:logged
```

Package targets:

```bash
bun run package:desktop:dir
bun run package:linux:dir
bun run package:linux:appimage
bun run package:linux:deb
```

If native modules become out of sync, rebuild them manually:

```bash
bun run rebuild:electron-deps
```

### Why Native Rebuilds Exist

`better-sqlite3` and `node-pty` are native modules. They are compiled for the host Node.js ABI during install, but Stave runs inside Electron, which ships its own Node runtime and ABI. The repo therefore patches `better-sqlite3` for Electron 41 and rebuilds both modules for the installed Electron version.

## Contributing Notes

- Use Conventional Commits for commit messages.
- Keep the root [README](../../README.md) focused on overview plus common install and setup paths, and move deep technical detail into `docs/`.
- Use `bunx --bun` instead of `npx`.
- Run the relevant validation commands before opening a PR.
- For high-risk surfaces such as UI theme tokens, terminal runtime behavior, IPC schemas, Zustand selectors, and React effect or observer logic, follow the guardrails in [AGENTS.md](../../AGENTS.md).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `NODE_MODULE_VERSION` mismatch on launch | Native modules were compiled for host Node, not Electron | `bun run rebuild:electron-deps` |
| App crashes or freezes on first persist | Electron rebuild or `better-sqlite3` patch did not apply correctly | `bun run rebuild:electron-deps` |
| `Patch signature not found` during rebuild | `better-sqlite3` version changed or `node_modules` is corrupted | `bun install && bun run rebuild:electron-deps` |
| Build fails with `node-gyp` errors | Missing C++ toolchain | Install the platform toolchain listed above, then reinstall |
| macOS repeatedly asks for Desktop, Documents, or Downloads access in development | Electron dev builds change identity frequently, which invalidates stored TCC grants | Grant access in **System Settings -> Privacy & Security -> Files and Folders -> Stave**, or validate the behavior in a packaged build |

## Architecture Pointers

- `src/` renderer app, Zustand store, chat UI, editor surfaces, and client bridges
- `electron/` Electron main process, preload bridge, provider runtimes, persistence, and IPC handlers
- `server/` browser-only dev bridge server
- `docs/` stable product, architecture, and developer documentation
- `tests/` unit and end-to-end coverage

Good starting points:

- [Developer docs index](index.md)
- [Runtime architecture](../architecture/runtime.md)
- [Entrypoints](../architecture/entrypoints.md)
- [Contracts](../architecture/contracts.md)
- [Provider runtimes](../providers/provider-runtimes.md)
- [Developer diagnostics](diagnostics.md)
- [Terminal regression prevention](terminal-regression-prevention.md)
- [Zustand selector stability](zustand-selector-stability.md)
