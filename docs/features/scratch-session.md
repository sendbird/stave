# Scratch Session

## Summary

- A scratch session is a lightweight chat you open against any folder straight from the top bar, without registering that folder as a project.
- Use it for a quick, throwaway question or edit in a directory you do not want cluttering your project list.

## When To Use It

- You want to ask about — or make a small edit in — a folder you have not set up as a Stave project (a downloads folder, a scratch clone, a one-off script directory).
- You want a disposable session that leaves no trace: nothing is saved, and the folder never appears in your project list or recents.
- Reach for a real **project** instead when you need durable history, worktrees, plans, the advisor, child tasks, or more than one concurrent session.

## Before You Start

- No setup is required — the scratch session button is always on the top bar, even when no project is open.
- Scratch sessions can **modify files**. When the agent wants to make a change, an approval request appears inline inside the popover and waits for your decision.
- If the agent needs a choice or clarification, its questions also appear inline with controls to answer or decline.
- On macOS the first folder you pick may trigger a system folder-access prompt. See [macOS Folder Access](macos-folder-access-prompts.md).

## Quick Start

1. Click the **Scratch session** button (the folder-with-code icon) on the right side of the top bar.
2. Click **Pick a folder** in the popover header and choose a directory.
3. (Optional) Switch the provider between **Claude Code** and **Codex**.
4. Type a question in the input at the bottom and press **Send**.

## Interface Walkthrough

### Entry Points

- The **Scratch session** button sits in the top bar, just after the Routines button. It is not tied to a project, so it is available even on the empty "no project" screen.
- A small dot appears on the button when a turn is running (neutral) or an approval is waiting (highlighted), so you can tell at a glance that the session needs you.

### Key Controls

- **Folder chip** — shows the selected folder path, or "Pick a folder" when none is chosen. Click it to pick or switch folders. Switching to a different folder clears the current session first (you are asked to confirm).
- **Provider toggle** — choose **Claude Code** or **Codex** for the session. It is disabled while a turn is running.
- **Clear** — ends the current session: stops any running turn, drops any waiting approval, and empties the transcript, while keeping the selected folder. You are asked to confirm only when a turn is running or an approval is waiting.
- **Input + Send / Stop** — the single-line composer at the bottom. Send is disabled until a folder is picked and you have typed something. While a turn is running, **Send** is replaced by **Stop**.
- **Approval rows** — when the agent requests a change, an inline row shows the tool and description with **Approve** and **Deny** buttons. Both are disabled while your response is being delivered.
- **Question cards** — when the agent needs more information, answer its inline questions and press **Continue**, or choose **Decline to answer**.

## Common Workflows

### Ask About A Folder

1. Open the popover, pick a folder, and keep the provider on its default.
2. Ask your question and press **Send**.
3. The reply streams into the transcript. The popover keeps streaming even if you close it — reopen to catch up.

### Approve Or Stop A Change

1. When an approval row appears, read the tool and description, then click **Approve** or **Deny**.
2. To abandon a turn entirely, press **Stop** — the running turn is aborted and any waiting approval is dropped.

### Answer A Follow-up Question

1. Select or type an answer in the inline question card.
2. Press **Continue** to resume the turn, or **Decline to answer** to reject the request.

### Start Over Or Switch Folders

1. Press **Clear** to wipe the transcript but keep the same folder for the next question.
2. To move to a different folder, click the folder chip and pick a new one; confirm the prompt to clear the old session before the new folder opens.

## Files And Data

- Nothing is persisted. A scratch session lives only in memory: closing the app discards it, and it is never written to the project registry, recent projects, or any on-disk snapshot.
- File edits the agent makes (after you approve them) are written to the chosen folder exactly like any other agent edit — those changes are real and stay on disk.

## Limitations And Advanced Options

- **One session at a time.** Picking a new folder replaces the current scratch session.
- **No plans, advisor, or child tasks.** Scratch sessions run a plain turn with the advisor disabled; use a full project for those workflows.
- **No saved history.** The transcript is gone when you clear the session or close the app.
- **Not a project.** The folder never appears in the project list or recents, and scratch sessions do not use worktrees.
- **Switching providers starts fresh.** Each provider keeps its own session, so changing from Claude Code to Codex (or back) begins a new thread for that provider — the other provider's earlier conversation is not carried over.

## Troubleshooting

### The Send button stays disabled

- Symptom: you cannot send a message.
- Cause: no folder is selected yet, or the input is empty.
- Fix: pick a folder with the folder chip and type a prompt; Send enables once both are present.

### An approval can no longer be answered

- Symptom: clicking Approve or Deny reports that the turn already ended.
- Cause: the turn finished or was stopped/cleared before the response was delivered.
- Fix: send your prompt again to start a fresh turn.

### A response could not be delivered

- Symptom: an error appears above the composer and the approval or question remains pending.
- Cause: the provider turn ended, or the response bridge rejected the request.
- Fix: retry the response if the turn is still running, or press Stop and send the prompt again.

### The provider toggle is greyed out

- Symptom: you cannot switch between Claude Code and Codex.
- Cause: a turn is currently running.
- Fix: wait for the turn to finish, or press Stop, then switch.

## Related Docs

- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Notifications](notifications.md)
