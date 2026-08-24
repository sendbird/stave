# Standalone CLI

## Summary

- Standalone CLI is a floating overlay that runs the real `claude` and `codex` executables in a folder of your choice, without registering that folder as a project.
- It has two fixed tabs, **Claude Code** and **Codex**, each a full terminal session for that provider's own CLI.
- Reach for it when you want the CLI's native interface — its own approvals, plan mode, model picker, and slash commands — instead of anything Stave renders.

## When To Use It

- You want to run Claude Code or Codex against a folder you have not set up as a Stave project (a downloads folder, a one-off clone, a script directory).
- You want the CLI's own terminal UI — including its native approval prompts, plan mode, model selection, and slash commands — rather than a Stave-rendered equivalent.
- You want a session that survives switching or deleting projects, because it is not attached to any project or workspace.
- Reach for a real **project** instead when you need Stave-rendered turns, worktrees, plans, the advisor, or child tasks.

## Before You Start

- Set a folder first: open `Settings > General`, find the **Standalone CLI** card, and enter an absolute folder path or click **Browse** to pick one.
- Both `claude` and `codex` must be available to the desktop app the same way they are for any other CLI session.
- On macOS, the first folder you pick with **Browse** may trigger a system folder-access prompt. See [macOS Folder Access](macos-folder-access-prompts.md).

## Quick Start

1. Open `Settings > General`, go to the **Standalone CLI** card, and set an absolute folder path (type it or click **Browse**).
2. Click the terminal icon on the top bar to open the overlay. It is there even with no project open.
3. Use the tab bar in the overlay header to pick **Claude Code** or **Codex**.
4. Type directly into the terminal, exactly as you would in a regular shell running that CLI.

## Interface Walkthrough

### Entry Points

- The top-bar terminal button opens the overlay. It is never disabled and always present, even on the empty "no project" screen. Opening it with no folder set shows an empty state with an **Open Settings** button instead of a terminal.

### Key Controls

- **Provider tabs** — the header's tab bar switches between **Claude Code** and **Codex**. Each tab is its own PTY session; switching tabs does not stop the session you switch away from.
- **Folder label** — the header shows the current folder's name (with the full path on hover), so you always know where the active CLI is running.
- **Restart** — one button in the row above the terminal. It acts on the active tab: that tab's CLI process ends and a fresh one starts with a new session, discarding that tab's conversation. The other tab is unaffected.
- **Close** — the header's close button, or a click on the dimmed backdrop outside the panel, hides the overlay. The top-bar button cannot close it: while the overlay is open, the backdrop covers the top bar. `Escape` is not a close shortcut here either: it is sent straight to the CLI, matching what `Escape` does in that CLI's own terminal interface.

## Common Workflows

### Ask Claude Code Or Codex About A Folder

1. Set the folder in `Settings > General > Standalone CLI` if you have not already.
2. Open the overlay from the top bar and make sure the tab you want (**Claude Code** or **Codex**) is active.
3. Type your prompt into the terminal and use the CLI's own controls for approvals, plan mode, model choice, or slash commands.

### Close And Resume Later

1. Close the overlay with the header's close button, or by clicking the dimmed backdrop outside the panel. The CLI process keeps running in the background.
2. Reopen the overlay at any time. The terminal screen is restored from where you left it, not restarted.
3. The restored screen is re-laid-out to the reopened panel's width before it is drawn, so lines do not pick up stray wrapping when the panel comes back at a different size. Scrollback written before the close keeps the width it was produced at.

### Start Over In The Same Folder

1. Select the tab you want to reset, then click **Restart** in the row above the terminal.
2. That tab's CLI process ends and a new one starts with a fresh session in the same folder. The other tab keeps its conversation.

### Switch Folders

1. Open `Settings > General > Standalone CLI` and enter or browse to a different absolute folder.
2. Both tabs restart in the new folder. Neither tab's prior conversation carries over.

## Files And Data

- The folder path lives in your app settings, not in the project registry, so it never appears in your project list or recents.
- Each tab's native CLI session id is persisted, so after quitting and relaunching the app, both tabs resume their prior conversations in the same folder via the CLI's own resume mechanism.
- File edits the CLI makes (through its own approval flow, if any) are written to the configured folder exactly like any other CLI usage — those changes are real and stay on disk.

## Limitations And Advanced Options

- **One folder at a time.** Setting a new folder replaces the one both tabs are running against.
- **Exactly two tabs.** Claude Code and Codex are fixed; you cannot add more tabs or additional folders.
- **No Stave-rendered approvals, plan mode, or model picker.** The CLI's own interface owns all of that; Stave only hosts the terminal surface.
- **Not a project.** The folder never appears in the project list or recents, and Standalone CLI does not use worktrees, plans, the advisor, or child tasks.
- **Switching folders starts fresh for both tabs.** Changing the folder in Settings restarts both the Claude Code and Codex tabs and discards both conversations.

## Troubleshooting

### The overlay shows an empty state instead of a terminal

- Symptom: opening the overlay shows a message instead of a terminal.
- Cause: no folder is set yet.
- Fix: click **Open Settings** in the empty state — or open `Settings > General > Standalone CLI` directly — and set an absolute folder path.

### Escape does not close the overlay

- Symptom: pressing `Escape` inside the terminal leaves the overlay open.
- Cause: this is expected. `Escape` is forwarded to the CLI, the same as it would behave in that CLI's own terminal.
- Fix: close the overlay with the header's close button, or by clicking the dimmed backdrop outside the panel.

### A tab's conversation is gone after changing the folder

- Symptom: both tabs start empty after you change the Standalone CLI folder in Settings.
- Cause: this is expected. Changing the folder restarts both tabs and discards their conversations, since the earlier conversation belongs to the previous folder.
- Fix: none needed; start a new conversation in the new folder.

### Browse is unavailable or does nothing

- Symptom: clicking **Browse** shows an error instead of a folder picker.
- Cause: the folder picker bridge is only available in the full desktop app.
- Fix: run the desktop build, or type the absolute folder path directly into the field instead.

## Related Docs

- [Integrated Terminal](integrated-terminal.md)
- [macOS Folder Access](macos-folder-access-prompts.md)
