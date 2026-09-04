# Conversation Context

## Summary

- The composer shows how full the current task conversation is, once a provider reports a context window or a used percent.
- When the active provider accepts `/compact`, you can summarize the conversation from that meter without losing the draft you are typing.

## When To Use It

- Use it on a long task when replies start to lose earlier decisions or files.
- Use Compact when you want to keep working in the same task but free context.
- Use the status bar for account quota. That is a different number.

## Before You Start

- Finish at least one assistant turn so the provider can report context.
- Compact needs an idle composer. Stop or finish the current turn first.

## Quick Start

1. Open a task that has already completed a turn.
2. Look under the composer for a short fill bar and a percent.
3. Open the meter to read the latest reported fill.
4. Choose `Compact context` if you want the provider to summarize the conversation.

## Interface Walkthrough

### Entry Points

- The meter sits in the composer toolbar, left of the attach and send buttons.
- It appears only after a turn reports conversation context.

### Key Controls

- The fill bar uses the same ok / warn / critical tones as other usage meters: under 60%, under 85%, then above.
- The popover shows the percent and, when the provider reported them, used and window token counts.
- `Compact context` sends `/compact` as a utility turn and leaves the composer draft in place.

## Common Workflows

### Check Remaining Room

1. Complete a turn.
2. Open the meter.
3. Read the percent before sending a large follow-up.

### Compact And Continue

1. Wait until the turn is idle.
2. Open the meter and choose `Compact context`.
3. Keep the text already in the composer. It is not replaced.

## Files And Data

- The meter reads the latest assistant message usage already stored on the task.
- It does not add a new settings key or persist a separate counter.

## Limitations And Advanced Options

- Providers that never report a window or percent do not show the meter.
- Compact is offered for Claude and Codex, or when the loaded slash catalog includes `/compact`.
- Compact is a provider session command. It does not revert workspace files.

## Troubleshooting

### The Meter Is Missing

- Symptom: the composer has no fill bar.
- Cause: no stored message has reported conversation context yet.
- Fix: finish a turn, or continue with a provider that reports context.

### Compact Is Disabled

- Symptom: `Compact context` is visible but cannot be pressed.
- Cause: a turn is still running, or the task is waiting on an approval or question.
- Fix: finish or stop that interaction, then try again.
