# Return Summary

## Summary

- When you come back to a task after a while, a **Welcome back** card appears
  in its conversation, right after the last message you had seen, so what
  happened while you were away reads below it.
- The card lists what waits on you, each turn that finished, whether the task
  still works, its next step and the last decision: one row each, with the one
  action for it.
- **Got it** folds the card into a one-line divider at the same place; the
  divider opens it again.

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
   **Welcome back** card shows in the conversation where you had left off, and
   the conversation moves to it.
3. Press a row's button to act on it, then **Got it** to fold the card.

## Interface Walkthrough

### Entry Points

- The card sits in the conversation, right after the last message you had
  seen: your messages up to your last visit and the replies you had seen then.
  When none of the loaded messages had been seen, it sits before the first one.
- Coming back moves the conversation to the card once, when new messages
  follow it. When it is at the end of the conversation it is already in view
  and nothing moves. A reply that arrives later does not move the conversation
  again.

### Key Controls

- **Header**: **Welcome back** and how long you were away since when, such as
  **Away 2h 14m · since 2:05 PM**. After a restart it counts from your last
  message instead, and says so.
- **Rows**: each row has a state mark, a title, a detail line and one button.
  Rows keep one height; long text is cut with "…" and shows in full on hover.
  They are listed most urgent first:
  - **What waits on you** (an approval, a question, a result to review, a run's
    sign-off, a stalled turn): the wait and how long, the request's description,
    and the primary button, named for what it does: **Show request**, **Review
    outputs**, **See what failed**, **Check activity** or **Open run
    progress**. A wait with no action of its own, such as a pull request's
    state, offers **Check activity**.
  - **Each turn that finished while you were away**, failed turns first: the
    first line of the message that started it, and **Finished**, **Failed** or
    **Stopped** with the files it changed since your visit. **Show** scrolls the
    conversation to the start of its reply.
  - **Still working**, while a turn runs: **Ask a side question** opens a
    [side question](side-questions.md).
  - **Next**: the first Remaining line of the
    [handoff record](task-handoff-record.md), with **Open handoff**.
  - **Last decision**: the newest line of the handoff record under Approved
    decisions, or else the newest approval or answer you gave in the
    conversation (not one a Stave rule or the provider's permission mode
    decided). An answer shows your answer only. **Handoff** opens the record;
    for an approval or answer, **Show** scrolls the conversation to it, opens
    its turn's steps and focuses it.
  - When nothing waits, works or finished, one row says how the last turn
    ended, with its next step under it and **Open handoff** or **Write a
    reply**.
- **Show N more**: past four rows, the rest wait behind this button; **Show
  less** hides them again.
- **Got it** (or Esc inside the card) folds the card into a one-line divider
  with **Welcome back**, how long you were away and **Needs you** or how many
  turns finished. Focus moves to the divider; pressing it opens the card again
  and focuses its first button.
- Writing to the task folds the card too. Opened again, it shows what happened
  up to your message.
- When what the card says changes while it is open (a request is answered, a
  turn finishes), a screen reader announces its new first row.

## Files And Data

- Nothing is stored for the summary. It is read from the loaded conversation,
  the handoff record and Fleet's attention items. What you had seen when you
  left a task, and whether you folded its card, is kept in memory for this
  app session.
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
