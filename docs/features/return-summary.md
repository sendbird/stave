# Return Summary

## Summary

- When you come back to a task after a while, a short card at the top of its
  conversation says where the task stands and the one thing to do about it,
  then what changed while you were away and the last decision.
- Each part links to where it comes from, so you can check it in one click.

## When To Use It

- You switch back to a task you left running, or open Stave the next day.
- You want to know whether the task needs you before reading the conversation.
- For every task at once, use [Fleet](fleet-needs-me.md) instead.

## Before You Start

- Nothing to set up. The summary appears on its own.

## Quick Start

1. Leave a task (switch to another task, or to another app) for at least
   fifteen minutes.
2. Come back to it. If anything happened, or the task waits on you, the
   **Welcome back** card shows at the top of the conversation.
3. Press the card's action button to act on it, follow a fact's link, or
   close the card.

## Interface Walkthrough

### Entry Points

- The card appears at the top of the task's conversation, above the
  transcript, so it is visible without scrolling.

### Key Controls

- **Status**: the first line says what the task waits on and for how long
  (the same wait Fleet shows), with the request's description under it;
  otherwise whether it still works or how its last turn ended. Its mark uses
  the same state glyph and color as Fleet and the task tabs. When the
  [handoff record](task-handoff-record.md) lists Remaining work, its first
  line shows as **Next**.
- **Action button**: the one thing to do now, named for what it does: **Show
  request** goes to the waiting approval or question, **Review outputs** opens
  Outputs, **See what failed** and **Check activity** open Activity (a wait with no
  action of its own, such as a pull request's state, also offers **Check
  activity**), **Open
  run progress** opens Progress, **Open handoff** opens the record, **Ask a
  side question** opens a [side question](side-questions.md) while the task
  works, and **Write a reply** focuses the composer. It is the primary button
  when the task waits on you.
- **While you were away**: how many turns finished, files changed and steps
  ran since your last visit. They are counted against what you had seen when
  you left: a turn that was already running counts only the steps it made
  afterwards, and counts as finished once it ends. **Activity** opens the Task
  panel's Activity tab. The line is left out when nothing changed.
- **Last decision**: the newest line of the handoff record under Approved
  decisions, or else the newest approval or answer you gave in the
  conversation (not one a Stave rule or the provider's permission mode
  decided). **Handoff** opens the record; for an approval or answer, **Show**
  closes the card and scrolls the conversation to it, opening its turn's
  steps, and focuses it. The line is left out when there is no decision yet.
- Long text wraps to two lines; hover a line to read all of it.
- The close button dismisses the card until your next return. Writing to the
  task dismisses it too.
- The card sits over the conversation: while the task shows
  [Review](review-mode.md) it is out of sight, and it is there again when you
  switch back.

## Files And Data

- Nothing is stored for the summary. It is read from the loaded conversation,
  the handoff record and Fleet's attention items. What you had seen when you
  left a task is kept in memory until you come back.
- Your last visit is when you left the task during this session. After a
  restart, Stave uses your last message in the task instead, and the card says
  so.

## Limitations And Advanced Options

- Counts cover the part of the conversation that is loaded; very old turns
  may not be counted. After a restart, everything after your last message
  counts; if a task's conversation was not loaded when you left it, the turns
  begun by then count as seen.
- Moving focus into an embedded page, such as Lens, is not leaving the app.

## Related Docs

- [Task Handoff Record](task-handoff-record.md)
- [Turn Activity](turn-activity.md)
- [Side Questions](side-questions.md)
