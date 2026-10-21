# Diff Review Comments

## Summary

- In an editor diff, add comments to changed lines of a file. **Send review to
  agent** sends the task's pending comments to the agent as one message, with
  each commented file attached.
- After sending, the comments stay on their lines marked **Sent**. Once the file
  changes, each one says whether the lines it pointed at changed since it was
  sent. **Resolve** removes it. Stave reports a change; deciding that a comment
  was addressed stays with you.

## Sending

- **Send review to agent** in the editor toolbar sends every pending comment of
  the task.
- **Send only this file's comments** in the toolbar's more-actions menu sends
  the open file's comments and keeps the rest pending. It appears when other
  files also have comments.
- `Cmd/Ctrl+Alt+Enter` in the diff editor sends every pending comment. The
  diff editor's context menu has the same action.
- Comments written while a send is still going out stay pending. A second send
  of the same task is ignored until the first one finishes.

## After Sending

| Mark | Meaning |
| --- | --- |
| Sent · lines changed since | The commented line or its neighbours no longer read as they did when you sent it. |
| Sent · not changed yet | The commented lines are unchanged, allowing for a few lines added or removed above them. |
| Sent | The file was not open when the comment was sent, so there is nothing to compare. |

A sent comment stays at the line it was written on. If edits since then made
the file shorter than that line, it moves to the last line so you can still
resolve it.

## Limitations

- Sent comments are kept for the current app session. Restarting Stave clears
  them; pending comments are saved with the workspace.
- The check compares the commented line and its two neighbours with the file's
  current text, within three lines of where it was. A line that moved further
  reads as changed.
- Screen readers do not reach the comment boxes inside the diff: the editor
  hides the layer they are drawn in from assistive technology.
