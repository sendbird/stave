# Scratch Panel

## Summary

- The **Scratch** panel in the right rail lists what an agent saved to the workspace scratch folder, `.stave/scratch/`: screenshots, logs, command output and fetched JSON.
- Files appear while the agent works, newest first, with a preview of the selected file, so you can follow a long turn without opening each file.
- Sub-agents save to their own folders, and the panel groups their files by agent.
- **Attach to message** adds a scratch file to your next message.

## When To Use It

- Follow a test run or build while it happens: a log the agent writes with `tee` grows in the preview.
- Look at the Lens screenshots an agent took without scrolling back through the conversation.
- Check an API response or other JSON the agent fetched, pretty-printed.
- See what each sub-agent produced during a fan-out.
- Send a screenshot or log back to the agent with your next message.
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
- **Sub-agent groups**: files under `.stave/scratch/agents/<id>/` are listed under **Sub-agent <id>**, indented, with the group's file count. A group sits where its newest file falls in the list.
- **Row menu**: right-click a row (or press the context-menu key) for **Attach to message** and **Open in editor**.
- **Preview**: images, JSON (pretty-printed), logs and other text. A log follows its end while you are scrolled to the bottom; scroll up to read earlier lines and it stays where you are. Terminal color codes in logs are hidden.
- **Large text files**: the preview reads only the last 256 KB and says so, for example **Showing the last 256 KB of 3.0 MB.** It still follows the end as the file grows. Open the file in the editor to see all of it.
- **Attach to message** (paperclip in the preview header): adds the selected file to the current task's composer, the same way a pasted or dropped workspace file is attached, and focuses the composer. The message cites the file by its `.stave/scratch/...` path.
- **Open in editor**: opens the file in an editor tab. Images larger than the preview limit (8 MiB) show only this button.
- **Footer**: how long the files stay. In a project's main checkout it reads **Files older than 30 days are removed automatically.**; in a worktree workspace, **The files are removed when this workspace is archived.**

## Common Workflows

### Follow A Test Run

1. Ask the agent to run the tests. It saves the output with a command such as `bun test 2>&1 | tee .stave/scratch/tests.log`.
2. Open **Scratch** and select `tests.log`. The preview grows as the log is written.

### Review Lens Screenshots

1. When an agent takes a Lens screenshot, Stave also saves it as `.stave/scratch/lens/<date>-<time>-<n>.png`. The tool result names that path so the agent can cite it.
2. Open **Scratch** and select a file under `lens/`.

### Follow Sub-Agents

1. Ask a Claude task to split the work across sub-agents. Stave adds one line to each sub-agent's brief that names its own folder, `.stave/scratch/agents/<id>/`, where `<id>` is a short form of the sub-agent's description plus a short hash.
2. Codex has no way for Stave to change a sub-agent's brief, so the lead agent is asked to pass the same line on when it starts one with a short name it picks.
3. Open **Scratch**. Each sub-agent's files are grouped under **Sub-agent <id>**.

### Send A File Back To The Agent

1. Right-click the file in **Scratch** and choose **Attach to message**, or select it and choose the paperclip in the preview header.
2. Write your message and send it. The file is attached like any other workspace file.

## Files And Data

- `.stave/scratch/` in the workspace folder. Stave creates it before each turn that can write files and adds a `.gitignore` containing `*`, so its files stay out of `git status` in any repository. Opening the panel also creates it, so the panel can watch it.
- `.stave/scratch/lens/`: copies of Lens screenshots.
- `.stave/scratch/agents/<id>/`: what each sub-agent saved.
- The agent is told never to write secrets, tokens or environment dumps there. Treat the folder like any other local log: review a file before you share it.
- When an Agent Run report cites a scratch screenshot, log, JSON file or PDF, Stave keeps a copy in app data so the report still opens after the workspace is archived (see [Tars](tars.md#saved-html-outputs)).

## Limitations And Advanced Options

- While the panel is open, Stave watches the folder and lists it again within about 150 ms of a change, plus a safety check every 15 seconds. Where the folder cannot be watched (a platform without recursive file watching, a watcher that fails, or a folder removed while the panel is open), the panel checks it every 1.5 seconds instead. Either way it checks only while the window is visible. With the panel closed, the button checks every 5 seconds only while a turn runs.
- Retention: in each project's main checkout, files older than 30 days are deleted shortly after Stave starts and then at most once a day. Only regular files inside `.stave/scratch/` are deleted; links are never followed or removed, and a folder is removed only when the deletion emptied it. Worktree workspaces are not cleaned this way: archiving the workspace removes its worktree and the folder with it. A linked external worktree keeps its folder when archived.
- Read-only analysis turns and turns with every tool turned off do not create the folder and are not told about it. Their sub-agents are not given a folder either.
- A folder reached through a symbolic link (for example, `.stave` linked elsewhere) is not used and lists as empty. The preview and the panel refuse any file reached through a link.

## Troubleshooting

### The Panel Stays Empty

- Symptom: **No scratch files yet** while the agent is working.
- Cause: the agent has not saved anything there, or the provider is Cursor, Kiro or OpenCode, which are not told about the folder.
- Fix: ask the agent to save its logs or screenshots to `.stave/scratch/`.

### A File Does Not Preview

- Symptom: the preview shows only **Open in editor**.
- Cause: the image is larger than the preview limit, the file type has no preview, or the file was removed or replaced by a link.
- Fix: select **Open in editor**.

### A Log Starts Mid-File

- Symptom: the preview shows **Showing the last 256 KB of …** and earlier lines are missing.
- Cause: the file is larger than 256 KB, so only its end is read.
- Fix: select **Open in editor** to read the whole file.

## Related Docs

- [Lens Browser](lens.md)
- [Workspace Scripts](workspace-scripts.md)
- [Tars](tars.md)
