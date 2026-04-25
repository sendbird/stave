<div align="center">
  <img src="build/icon.svg" width="100" alt="Stave Logo" />
</div>

# Stave

Stave is a desktop AI coding workspace for Claude and Codex. It combines task-oriented chat, repo-aware context, an editor and terminal, workspace memory, and local automation in one app.

![Stave](docs/screenshots/stave-app.png)

## Install the App on macOS

The packaged macOS install flow uses GitHub CLI authentication:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/install-latest-release.sh | bash
```

If this is your first time using `gh`, or you need SSO or scope help, see the full [Install Guide](docs/install-guide.md).

Packaged macOS builds can also check for updates from the top bar and install them in place.

## Build from Source

Requirements:

- Bun
- Node.js >= 20
- a native build toolchain for `better-sqlite3` and `node-pty`

Install dependencies:

```bash
bun install
```

Start the Electron app in development:

```bash
bun run dev:desktop
```

Useful command for validating a packaged desktop build:

```bash
bun run run:desktop:packaged:logged
```

This rebuilds Electron native dependencies, produces the desktop build, launches the packaged app, and writes a timestamped log file for debugging packaged-only issues.

For other development, packaging, and contribution commands, see [Developer and Contributing Guide](docs/developer/contributing.md).

## Provider Setup

To use provider-backed chats, install and authenticate the CLIs you want Stave to drive.

```bash
claude auth login
codex login
```

Recommended next steps:

- Open `Settings -> Providers` and choose the runtime controls you want.
- Open `Settings -> Providers -> Stave` if you want to enable the built-in local MCP server.
- If macOS asks for Desktop, Documents, or Downloads access, approve it once or see [macOS Folder Access Prompts](docs/features/macos-folder-access-prompts.md).

## Features

- task-based Claude and Codex chats with approvals, diffs, plans, queued follow-ups, and Coliseum multi-model comparisons
- Monaco editor, docked terminal, quick open, command palette, and source control actions
- workspace-scoped notes, todos, saved plans, PR links, Jira, Figma, Confluence, and Slack references
- git worktree-aware project and workspace management
- attachments, notifications, skill selection, custom model shortcuts, theme presets, and Zen mode
- local-only MCP access for same-machine automation and tool-driven workflows

## Documentation

- [Install Guide](docs/install-guide.md) for the full macOS install and update flow
- [Coliseum Guide](docs/features/coliseum.md) for side-by-side multi-model comparisons and winner promotion
- [Provider Sandbox and Approval Guide](docs/features/provider-sandbox-and-approval.md) for runtime safety and plan settings
- [Local MCP User Guide](docs/features/local-mcp-user-guide.md) for same-machine automation setup

## For Developers And Contributors

Development setup, build and packaging commands, architecture pointers, and contribution guidance live in [Developer Docs](docs/developer/index.md) and the [Developer and Contributing Guide](docs/developer/contributing.md).

## License

[Apache-2.0](LICENSE) — see [NOTICE](NOTICE) for attribution.
