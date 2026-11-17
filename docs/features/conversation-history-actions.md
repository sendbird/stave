# Conversation History Actions

## Summary

Use a response's history actions to fork the conversation, restore the files saved before a turn, or return a fork's result to its original task. File restoration and conversation rollback are separate choices.

## Before You Start

- Wait for the active turn to finish before restoring or forking.
- Forking needs a linked native session and a response with recorded native turn metadata.
- File restoration needs a retained snapshot captured before the selected turn.
- A running task that shares the worktree, or changes attributed to another task, can prevent restoration. Read the explanation before trying again.

## Quick Start

1. Open a completed response through its message actions or the conversation rail.
2. Choose `Restore files to before this turn`.
3. Choose `Keep conversation, restore files`, or `Restore files and roll back conversation` when the provider supports conversation rollback.
4. After restoring, use `Undo restore` to recover the files saved immediately before the restore.

## File Snapshots

Before each user turn starts, the host records tracked, staged and untracked files, excluding ignored files. Capture does not change the branch, index or working files. Unchanged states reuse the previous snapshot. Retention is bounded and configurable, with a default of 50 snapshots per task; older snapshots are pruned. Set `STAVE_TURN_SNAPSHOT_LIMIT` when launching the host to change the limit (1–500).

`Keep conversation, restore files` restores the saved files and keeps the messages. The combined option also rolls back the conversation, and appears only for a provider that supports it. Otherwise, use `Fork here` to continue from the chosen point in another conversation. The same file action works across providers; the host selects the available restoration method.

The host saves the current files before restoration so `Undo restore` can recover them. Restoration refuses to run while this task has an active turn, while another running task shares the worktree, or when it would overwrite changes made by another task. Undo follows the same safety checks.

## Fork And Return

1. Choose `Fork here` on a completed response.
2. Continue in the new task. Forking leaves the original conversation and its files unchanged.
3. Once the fork has a final answer, choose `Send result to original`.
4. Review the quoted answer and fork link in the original task's composer, then send when ready.

The fork retains its parent link after restart. Returning a result also attaches the fork as task context, so the original can read its details when the message is sent. Returning fills the composer and never sends the message automatically. If the original task is unavailable, the action explains why it cannot return the result.

## Conversation Controls

- `Fork here` creates and selects a task that starts at the chosen response.
- `Rollback here` removes later conversation messages when supported. This conversation-only action does not restore files; choose the file restoration action for that.
- Disabled actions explain missing metadata, active work or unsupported provider capabilities.
- Arrow keys move between conversation-rail ticks. `Home` and `End` jump to the first and last loaded turns. `Tab` enters preview actions and `Escape` closes the preview.
- Use `Settings > Chat > Show Conversation Turn Rail` to hide the rail.
- The task tab menu exposes `Rename task`.

## Limitations

Only retained snapshots can restore files. Loading older messages does not recreate a pruned snapshot. Conversation rollback availability depends on the provider; file restoration does not require that capability. Forking and restoring do not automatically send another message.

## Troubleshooting

### Restoration Is Unavailable

Finish or stop active work, then check the displayed reason. A snapshot may have expired, the worktree may be shared by active work, or another task may have changed files. Preserve and reconcile those changes before restoring.

### Conversation Rollback Left Files Unchanged

Conversation-only rollback changes messages. Use `Restore files to before this turn` and choose the combined option when both files and conversation must return to the selected point.

## Related Docs

- [Runtime Safety Controls](provider-sandbox-and-approval.md)

## Find in conversation

Press Cmd+F / Ctrl+F with focus in the conversation or its composer, or hover the transcript and choose the search button in its top-right corner. The find bar floats over the top-right corner of the transcript instead of pushing messages down; pressing Cmd+F / Ctrl+F again selects the query. Escape or the close button hides it and returns focus to where it was. Enter at least two characters. Search combines loaded messages, including unsaved streaming text and older inline snapshots, with local index hits for unloaded history. Matching message IDs appear once. The index includes user messages, assistant replies and readable tool summaries. Raw tool payloads and thinking parts are excluded. Enter and Shift+Enter move to the next and previous matching message, wrapping at either end. Opening a match loads its history window automatically. Use **Load newer messages** to move forward again after a jump. **Back to latest** or sending a message returns to the live transcript. Search refreshes once when backfill completes and keeps the selected message.
