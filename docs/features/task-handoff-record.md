# Task Handoff Record

## Summary

- Each task keeps a handoff record: its goal, the decisions and constraints you
  approved, verified results, remaining work, and cautions.
- When a provider starts on the task, or comes back to it after another
  provider worked on it, the record is sent ahead of the conversation, so the
  constraint you settled on is what the new provider reads first.
- When you save a change, the provider working on the task receives the new
  record with its next message, once.

## When To Use It

- Before switching a long task between providers, so the next one knows what
  was decided.
- Before leaving a task for a while, so you, or anyone, can pick it up again.
- After a restart, to see what the task settled without rereading it.
- Use the workspace's Information notes for what belongs to the whole
  workspace; the record belongs to one task.

## Before You Start

- Open a task. The record lives in the Task panel of the right rail.

## Quick Start

1. Open the Task panel and choose the **Handoff** tab.
2. Choose **Edit**, write the sections that matter, and choose **Save**.
3. Keep working. A provider that starts on the task, or comes back to it,
   receives the record ahead of the conversation.

## Interface Walkthrough

### Entry Points

- Task panel → **Handoff**. The panel button in the composer shelf opens the
  Task panel; choose the Handoff tab there.

### Key Controls

- **Edit** opens the five sections for editing. Each section holds up to 2,000
  characters; use `- ` lines for lists.
- **Fill from this task** adds facts Stave recorded, for you to review before
  saving:
  - Stave's latest checks after a turn: passing checks go to Verified results,
    failing ones to Cautions;
  - approvals you granted in the loaded conversation go to Approved decisions;
  - plans linked to the task go to Remaining work.
  Lines a section already has are not added twice.
- **Ask the agent to update** sends the task's agent a message that asks for a
  proposed record. Its reply carries the proposal in a block Stave reads; the
  tab then shows **The agent proposed changes** with **Review** and
  **Dismiss**. Review opens the editor with the proposal filled in. Nothing
  changes until you save. The button is off while a turn runs.
- Each saved section says who last changed it and when: you, the agent (a
  proposal you saved as it was), or Stave (facts you saved as they were).
  Editing a section makes it yours.

## Common Workflows

### Keep A Constraint Through A Provider Switch

1. Write the constraint under **Approved decisions** and save.
2. Switch the composer to another provider. The composer shelf's switch line
   says the record goes first; choose **What it receives** for the details.
3. Send. The provider reads the record, then the conversation excerpt.
4. Switching back works the same way: the returning provider receives the
   record with what happened since it last worked on the task.

### Pick A Task Up After A Restart

1. Open the task and the **Handoff** tab. The record is as you saved it.
2. Use **Fill from this task** for the latest checks and approvals, review, and
   save.

### Resolve An Edit Conflict

- Symptom: saving says **This record changed while you were editing**.
- Cause: the record was saved elsewhere (another window, or a proposal you
  accepted) after you began.
- Fix: choose **Save my version** to keep yours, or **Discard my changes** to
  read the saved record.

## Files And Data

- The record is stored in the app database with the task, one per task. It is
  kept when the task is archived and deleted when the task is deleted or its
  workspace is closed or removed. Saving a record for a task that was deleted
  meanwhile is refused; a task created a moment ago is stored first, then its
  record.
- Unsaved edits stay while Stave is open, also when you switch tabs or tasks;
  a restart ends them, like an unsaved editor. Text you type while a save is
  in progress stays in the editor after the save; save again to keep it.
- The record is sent as part of the turn's prompt whenever the conversation
  excerpt is: when a provider starts a session for the task, or resumes after
  another provider worked on it.
- A provider continuing its own session receives the record again only when
  you saved a change since that session last received it: its next message
  carries the new record once, marked as replacing the earlier one, without
  the excerpt. If you emptied the record, that message says the earlier record
  no longer applies. Each provider session keeps the record revision it has,
  also across restarts; a message that fails does not count, so the next one
  sends the record again.

## Limitations And Advanced Options

- The record is plain text in five sections; there is no formatting beyond
  line breaks.
- The agent changes the record only when asked and only through your save.
- **Fill from this task** reads approvals from the conversation that is
  loaded; approvals further back are not offered.
- The record does not replace the conversation: the provider still receives
  the bounded excerpt described in
  [Conversation Context](conversation-context.md#keeping-long-tasks-grounded).

## Troubleshooting

### The Agent's Proposal Does Not Appear

- Symptom: the agent answered, but the tab shows no proposal.
- Cause: the reply did not contain a readable proposal block, or the record
  already says what it proposed.
- Fix: ask again, or edit the record yourself.

## Related Docs

- [Conversation Context](conversation-context.md)
- [Turn Activity](turn-activity.md)
