# Standalone CLI

## Summary

- Standalone CLI is a popover, anchored to a top-bar button, that runs the real `claude`, `codex`, `agent` (Cursor), and `kiro-cli` executables in a folder of your choice, without registering that folder as a project.
- It has one fixed tab per AI provider — **Claude Code**, **Codex**, **Cursor**, and **Kiro** — each a full terminal session for that provider's own CLI.
- Reach for it when you want the CLI's native interface — its own approvals, plan mode, model picker, and slash commands — instead of anything Stave renders.

## When To Use It

- You want to run one of the AI CLIs against a folder you have not set up as a Stave project (a downloads folder, a one-off clone, a script directory).
- You want the CLI's own terminal UI — including its native approval prompts, plan mode, model selection, and slash commands — rather than a Stave-rendered equivalent.
- You want a session that survives switching or deleting projects, because it is not attached to any project or workspace.
- Reach for a real **project** instead when you need Stave-rendered turns, worktrees, plans, the advisor, or child tasks.

## Before You Start

- Set a folder first: open `Settings > General`, find the **Standalone CLI** card, and enter an absolute folder path or click **Browse** to pick one.
- The CLI for the tab you want (`claude`, `codex`, `agent`, or `kiro-cli`) must be available to the desktop app the same way it is for any other CLI session. A tab whose CLI is not installed shows an "executable not found" message instead of a terminal; the other tabs are unaffected.
- On macOS, the first folder you pick with **Browse** may trigger a system folder-access prompt. See [macOS Folder Access](macos-folder-access-prompts.md).

## Quick Start

1. Open `Settings > General`, go to the **Standalone CLI** card, and set an absolute folder path (type it or click **Browse**).
2. Click the terminal icon on the top bar to open the panel. It is there even with no project open.
3. Use the tab bar in the panel header to pick **Claude Code**, **Codex**, **Cursor**, or **Kiro**.
4. Type directly into the terminal, exactly as you would in a regular shell running that CLI.

## Interface Walkthrough

### Entry Points

- The top-bar terminal button opens the panel below itself. It is never disabled and always present, even on the empty "no project" screen. Opening it with no folder set shows an empty state with an **Open Settings** button instead of a terminal.

### Key Controls

- **Provider tabs** — the header's tab bar switches between **Claude Code**, **Codex**, **Cursor**, and **Kiro**. Each tab is its own PTY session; switching tabs does not stop the session you switch away from.
- **Folder label** — the header shows the current folder's name (with the full path on hover), so you always know where the active CLI is running.
- **Restart** — one button in the row above the terminal. It acts on the active tab: that tab's CLI process ends and a fresh one starts with a new session, discarding that tab's conversation. The other tabs are unaffected.
- **Close** — click anywhere outside the panel, press the top-bar button again, or use the header's close button. Nothing is dimmed and nothing is blocked: the rest of the app stays usable while the panel is open. `Escape` is not a close shortcut here: it is sent straight to the CLI, matching what `Escape` does in that CLI's own terminal interface.

## Common Workflows

### Ask A CLI About A Folder

1. Set the folder in `Settings > General > Standalone CLI` if you have not already.
2. Open the panel from the top bar and make sure the tab you want is active.
3. Type your prompt into the terminal and use the CLI's own controls for approvals, plan mode, model choice, or slash commands.

### Close And Resume Later

1. Close the panel by clicking outside it, pressing the top-bar button again, or using the header's close button. The CLI process keeps running in the background.
2. Reopen the panel at any time. It comes back exactly as you left it — the terminal is hidden while the panel is closed, not torn down, so reopening is a repaint rather than a restore.
3. Output the CLI writes while the panel is closed lands in that same terminal, so you see it as soon as you reopen.
4. After an app restart there is no live terminal to keep, so the screen is rebuilt from a saved snapshot instead. That snapshot is re-laid-out to the panel's width before it is drawn, so lines do not pick up stray wrapping. Scrollback written before the restart keeps the width it was produced at.

### Start Over In The Same Folder

1. Select the tab you want to reset, then click **Restart** in the row above the terminal.
2. That tab's CLI process ends and a new one starts with a fresh session in the same folder. The other tabs keep their conversations.

### Switch Folders

1. Open `Settings > General > Standalone CLI` and enter or browse to a different absolute folder.
2. Every tab restarts in the new folder. No tab's prior conversation carries over.

## Files And Data

- The folder path lives in your app settings, not in the project registry, so it never appears in your project list or recents.
- Each tab's native CLI session id is persisted, so after quitting and relaunching the app, the tabs resume their prior conversations in the same folder via the CLI's own resume mechanism. How the id is obtained differs per CLI:
  - **Claude Code** — Stave issues the id up front (`--session-id`) and resumes with `--resume`.
  - **Codex** — the id is discovered after launch by scanning `~/.agents/codex/sessions`; resume is `codex resume <id>`.
  - **Kiro** — the id is discovered after launch by polling `kiro-cli chat --list-sessions --format json` in the folder; resume is `--resume-id <id>`.
  - **Cursor** — conversations live on Cursor's servers, so Stave asks the CLI for an id with `agent create-chat` _before_ launching and starts with `--resume <chatId>`. This adds roughly two seconds to the Cursor tab's first start, and needs you to be online and signed in. If it fails, the tab still works but that conversation cannot be resumed after a restart.
- File edits the CLI makes (through its own approval flow, if any) are written to the configured folder exactly like any other CLI usage — those changes are real and stay on disk.

## Limitations And Advanced Options

- **One folder at a time.** Setting a new folder replaces the one every tab is running against.
- **Fixed tabs, one per provider.** Claude Code, Codex, Cursor, and Kiro are always shown; you cannot add more tabs or additional folders. A new provider added to Stave gets a tab automatically — see [Adding A Provider](../developer/adding-a-provider.md).
- **No Stave-rendered approvals, plan mode, or model picker.** The CLI's own interface owns all of that; Stave only hosts the terminal surface.
- **Not a project.** The folder never appears in the project list or recents, and Standalone CLI does not use worktrees, plans, the advisor, or child tasks.
- **Switching folders starts fresh for every tab.** Changing the folder in Settings restarts all four tabs and discards their conversations.
- **Cursor resume depends on the network.** See Files And Data above; an offline or signed-out first start means that Cursor conversation is not resumable.

## Troubleshooting

### The panel shows an empty state instead of a terminal

- Symptom: opening the panel shows a message instead of a terminal.
- Cause: no folder is set yet.
- Fix: click **Open Settings** in the empty state — or open `Settings > General > Standalone CLI` directly — and set an absolute folder path.

### Escape does not close the panel

- Symptom: pressing `Escape` inside the terminal leaves the panel open.
- Cause: this is expected. `Escape` is forwarded to the CLI, the same as it would behave in that CLI's own terminal.
- Fix: close the panel by clicking outside it, pressing the top-bar button again, or using the header's close button.

### A tab's conversation is gone after changing the folder

- Symptom: every tab starts empty after you change the Standalone CLI folder in Settings.
- Cause: this is expected. Changing the folder restarts all tabs and discards their conversations, since the earlier conversation belongs to the previous folder.
- Fix: none needed; start a new conversation in the new folder.

### Browse is unavailable or does nothing

- Symptom: clicking **Browse** shows an error instead of a folder picker.
- Cause: the folder picker bridge is only available in the full desktop app.
- Fix: run the desktop build, or type the absolute folder path directly into the field instead.

## Related Docs

- [Integrated Terminal](integrated-terminal.md)
- [macOS Folder Access](macos-folder-access-prompts.md)
