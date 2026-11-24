# Scratch Panel

## Summary

- The **Scratch** panel in the right rail lists what an agent saved to the workspace scratch folder, `.stave/scratch/`: screenshots, logs, command output and fetched JSON.
- Files appear while the agent works, newest first, with a preview of the selected file, so you can follow a long turn without opening each file.

## When To Use It

- Follow a test run or build while it happens: a log the agent writes with `tee` grows in the preview.
- Look at the Lens screenshots an agent took without scrolling back through the conversation.
- Check an API response or other JSON the agent fetched, pretty-printed.
- Use the Explorer or the editor for project files. Scratch is only for what the agent produced along the way.

## Before You Start

- Open a repository and a workspace.
- Claude and Codex are told about the folder in every turn that can write files. Cursor, Kiro and OpenCode are not told about it, because Stave does not set their system prompt; their Lens screenshots still land in the folder.

## Quick Start

1. Start a task and ask for work that produces output, for example "run the tests and fix the failures".
2. Select **Scratch** in the right rail.
3. Pick a file to preview it. Until you pick one, the preview follows the newest file.

## Interface Walkthrough

### Entry Points

- **Scratch** in the right rail. While a turn runs and the panel is closed, a dot on the button means files arrived that you have not seen yet. Opening the panel clears it.

### Key Controls

- **Summary line**: how many files the folder holds and their total size. The list shows the newest 300 files, up to four folders deep.
- **File list**: name (relative to `.stave/scratch/`), age and size. Files written in the last 15 seconds carry a **New** badge. Double-click a row to open the file in the editor.
- **Preview**: images, JSON (pretty-printed), logs and other text. A log follows its end while you are scrolled to the bottom; scroll up to read earlier lines and it stays where you are.
- **Open in editor**: opens the file in an editor tab. Files larger than the preview limit (1 MiB for text, 8 MiB for images) show only this button.

## Common Workflows

### Follow A Test Run

1. Ask the agent to run the tests. It saves the output with a command such as `bun test 2>&1 | tee .stave/scratch/tests.log`.
2. Open **Scratch** and select `tests.log`. The preview grows as the log is written.

### Review Lens Screenshots

1. When an agent takes a Lens screenshot, Stave also saves it as `.stave/scratch/lens/<date>-<time>-<n>.png`. The tool result names that path so the agent can cite it.
2. Open **Scratch** and select a file under `lens/`.

## Files And Data

- `.stave/scratch/` in the workspace folder. Stave creates it before each turn that can write files and adds a `.gitignore` containing `*`, so its files stay out of `git status` in any repository.
- `.stave/scratch/lens/`: copies of Lens screenshots.
- The agent is told never to write secrets, tokens or environment dumps there. Treat the folder like any other local log: review a file before you share it.

## Limitations And Advanced Options

- The panel checks the folder every 1.5 seconds while it is open and the window is visible. With the panel closed, the button checks every 5 seconds only while a turn runs.
- Stave does not delete old scratch files. Remove them from the Explorer or the shell when you no longer need them.
- Read-only analysis turns and turns with every tool turned off do not create the folder and are not told about it.
- A folder reached through a symbolic link (for example, `.stave` linked elsewhere) is not used and lists as empty.

## Troubleshooting

### The Panel Stays Empty

- Symptom: **No scratch files yet** while the agent is working.
- Cause: the agent has not saved anything there, or the provider is Cursor, Kiro or OpenCode, which are not told about the folder.
- Fix: ask the agent to save its logs or screenshots to `.stave/scratch/`.

### A File Does Not Preview

- Symptom: the preview shows only **Open in editor**.
- Cause: the file is larger than the preview limit, or its type has no preview.
- Fix: select **Open in editor**.

## Related Docs

- [Lens Browser](lens.md)
- [Workspace Scripts](workspace-scripts.md)
