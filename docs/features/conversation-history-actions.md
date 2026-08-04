# Conversation History Actions

## Summary

Stave lets you branch or rewind a provider conversation from an earlier assistant response without reverting workspace files. A compact turn rail keeps these actions available while you read long task histories.

## When To Use It

- Fork when you want to explore a different approach from an earlier response in a new task.
- Roll back when you want to discard later Codex conversation turns and continue from an earlier response.
- Rename the task when its current title no longer describes the conversation; Stave also updates linked native provider sessions.
- Use Git or a checkpoint restore when you need to revert workspace files. Conversation actions do not change files.

## Before You Start

- The task must have a linked Claude or Codex native session.
- Point-in-time actions require responses recorded with native turn metadata. Legacy responses explain why they cannot be targeted.
- Wait for the active response to finish before forking or rolling back.

## Quick Start

1. Open a task with at least two completed assistant responses.
2. Hover or focus a tick in the right-side conversation rail.
3. Review the prompt and response preview.
4. Select `Fork here` or, for a supported Codex response, `Rollback here`.
5. Confirm a rollback after checking which later messages will be removed.

## Interface Walkthrough

### Entry Points

- The conversation rail appears on the right side of eligible task histories.
- The same actions remain available on assistant-message hover or keyboard focus.
- Use `Settings > Chat > Show Conversation Turn Rail` to hide the navigator when
  you prefer a wider conversation surface.
- The task tab context menu exposes `Rename task`.
- The existing provider thread inspector remains available for advanced inspection.

### Key Controls

- `Fork here`: creates and selects a new task whose native provider session starts at the chosen response. The source task remains unchanged.
- `Rollback here`: removes every later message from the task and rolls the linked Codex thread back to the same native turn. The latest response cannot be rolled back because there is nothing after it.
- Disabled actions remain focusable and show a tooltip explaining the provider or state limitation.
- Arrow keys move between rail ticks. `Home` and `End` jump to the first and last loaded turns, `Tab` enters the preview actions, and `Escape` closes the preview and restores focus.

## Common Workflows

### Explore An Alternative From An Earlier Response

1. Select the earlier response in the rail.
2. Choose `Fork here`.
3. Continue in the newly created task. The original task and workspace files remain unchanged.

### Continue A Codex Thread From An Earlier Turn

1. Select a non-latest Codex response.
2. Choose `Rollback here`.
3. Review the confirmation, then choose `Roll back conversation`.
4. Continue the task from the retained response.

## Files And Data

Stave persists the provider session and native turn identifiers with task messages. Fork and rollback update task conversation state and provider-native session state, but never apply a Git reset or restore workspace files.

## Limitations And Advanced Options

- Claude supports point-in-time fork and native rename, but its SDK does not expose in-place session rollback. The rollback control explains this limitation instead of disappearing.
- Codex supports point-in-time fork, rollback, and native rename through App Server.
- The rail describes only currently loaded turns. Use `Load older messages` before targeting an earlier unloaded response.
- Codex `/compact` remains a separate conversation command and does not restore a thread to a checkpoint.

## Troubleshooting

### An Action Is Disabled

- Symptom: `Fork here` or `Rollback here` is visible but unavailable.
- Cause: the response is still streaming, the task has an active turn, the native session is missing or stale, the response predates native turn tracking, or the provider does not support that action.
- Fix: hover or focus the action to read the exact reason, then finish the active turn or choose a newer eligible response.

### Rollback Did Not Restore Files

- Symptom: later chat messages are removed, but workspace edits remain.
- Cause: rollback intentionally changes conversation state only.
- Fix: use Git or a recorded workspace checkpoint when file restoration is also required.

## Related Docs

- [Runtime Safety Controls](provider-sandbox-and-approval.md)
