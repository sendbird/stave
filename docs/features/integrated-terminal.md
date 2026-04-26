# Integrated Terminal

Stave includes two terminal surfaces so shell work can stay inside the same workspace as your tasks and editor context.

![Integrated terminal dock in the Stave workspace shell](../screenshots/integrated-terminal.png)

This example shows the docked terminal at the bottom of the workspace. Docked terminals stay below the main content, while CLI sessions take over the center panel.

## The Two Terminal Surfaces

### Docked Terminal

Use the docked terminal when you want a normal shell that stays attached to the current workspace.

Good for:

- running tests
- checking git state
- starting a local dev server
- doing quick shell work without leaving the active task

### CLI Session

Use a CLI session when you want the center panel itself to become a live Claude or Codex terminal surface.

Good for:

- running Claude or Codex directly inside Stave
- keeping one provider session open while you continue normal workspace work
- using a task-linked CLI tab instead of a separate external terminal window

## Before You Start

- Open a project or workspace in Stave first.
- The terminal starts from the active workspace path.
- If you want Claude or Codex CLI sessions, make sure the relevant CLI is already available to the desktop app.

## Quick Start

1. Click `Terminal` to show the docked terminal.
2. Run shell commands in the dock while keeping the workspace visible.
3. When you want a dedicated provider session, choose `New CLI Session`.
4. Pick `Claude` or `Codex`, then choose whether the session should be linked to the workspace or the active task.

## Common Workflows

### Run Quick Commands Without Leaving The Task

1. Open the docked terminal.
2. Run commands like `git status`, `bun test`, or a local dev server.
3. Keep the chat, editor, and side panels visible while the command runs.

### Open A Terminal At A Specific Folder

1. Open the workspace path menu or Explorer context menu.
2. Choose `Open in Stave Terminal`.
3. Stave creates a docked terminal tab rooted at that path.

This is useful when one workspace contains multiple apps or nested packages.

### Run Claude Or Codex In The Main Panel

1. Choose `New CLI Session`.
2. Pick the provider and context you want.
3. Stave opens a full-panel CLI tab in the center area.
4. If the session is task-linked, use `Paste Handoff` when you want to inject the saved task summary into that live session.

### Start With A CLI Session Before Creating A Task

1. Open a workspace with no active task yet.
2. Use `New CLI Session` from the empty state.
3. Pick `Claude · Workspace` or `Codex · Workspace`.

You do not need to create a task first just to open a provider session.

## Key Behaviors

- Docked terminal tabs live in the bottom terminal dock.
- CLI session tabs live in the top strip and replace the main task view while selected.
- Closing a terminal tab and hiding the dock are separate actions.
- Within the same workspace, Stave restores terminal surfaces when you come back to them.

## Troubleshooting

### A system terminal opened instead

- Symptom: your OS terminal app opens outside Stave.
- Cause: you chose `Open in Terminal`, which is the external-terminal action.
- Fix: use `Open in Stave Terminal` instead.

### The terminal area appears but nothing happens

- Symptom: the dock or CLI session opens, but you do not see normal output.
- Cause: the session did not launch correctly.
- Fix: reopen the tab first. If you are running a local development build, restart the desktop app and try again.

### A Claude or Codex CLI session fails to start

- Symptom: the panel switches to the CLI view, but the provider session does not become usable.
- Cause: the provider CLI is missing or unavailable to the desktop runtime.
- Fix: verify the provider CLI installation and check the related provider settings in Stave.

## Related Docs

- [Command Palette](command-palette.md)
- [Zen Mode](zen-mode.md)
- [Install Guide](../install-guide.md)
