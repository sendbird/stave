# Return Summary

## Summary

- When you come back to a task after a while, a short summary at the top of
  its conversation says what you need to pick it up: the last decision, what
  changed while you were away, where the task stands and what to do next.
- Each line links to where it comes from, so you can check it in one click.

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
3. Follow a line's link, or close the card.

## Interface Walkthrough

### Entry Points

- The card appears at the top of the task's conversation, above the
  transcript, so it is visible without scrolling.

### Key Controls

- **Last decision**: the newest line of the task's
  [handoff record](task-handoff-record.md) under Approved decisions, or else
  the newest approval or answer you gave in the conversation. **Handoff**
  opens the record.
- **While you were away**: how many turns finished, files changed and steps
  ran since your last visit. **Activity** opens the Task panel's Activity tab.
- **Where it stands**: what the task waits on and for how long (the same wait
  Fleet shows), whether it still works, or how its last turn ended. **Show**
  goes to the waiting request; other states link to Activity, Outputs or
  Progress.
- **Next**: what to do, from what the task waits on, or the first line of the
  record's Remaining work. Its link takes you there: the request, Outputs,
  Activity, Progress, the handoff record, a [side question](side-questions.md)
  while it works, or the composer.
- The close button dismisses the card until your next return. Writing to the
  task dismisses it too.

## Files And Data

- Nothing is stored for the summary. It is read from the loaded conversation,
  the handoff record and Fleet's attention items.
- Your last visit is when you left the task during this session. After a
  restart, Stave uses your last message in the task instead, and the card says
  so.

## Limitations And Advanced Options

- Counts cover the part of the conversation that is loaded; very old turns
  may not be counted.
- Moving focus into an embedded page, such as Lens, is not leaving the app.

## Related Docs

- [Task Handoff Record](task-handoff-record.md)
- [Turn Activity](turn-activity.md)
- [Side Questions](side-questions.md)
