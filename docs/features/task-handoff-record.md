# Task Handoff Record

## Summary

- Each task keeps a handoff record: its goal, the decisions and constraints you
  approved, verified results, remaining work, and cautions.
- When a provider starts on the task, or comes back to it after another
  provider worked on it, the record is sent ahead of the conversation, so the
  constraint you settled on is what the new provider reads first.
- The Task panel has no Handoff tab: the editor saw almost no use and was
  removed. A record already saved is kept and still sent as described here;
  there is no screen to write or edit one.

## Common Workflows

### Keep A Constraint Through A Provider Switch

1. With a saved record, switch the composer to another provider. The composer
   shelf's switch line says the record goes first; choose **What it receives**
   for the details.
2. Send. The provider reads the record, then the conversation excerpt. It checks which source state earlier results cover. It acts on remaining work only when your current request calls for it.

## Files And Data

- The record is stored in the app database with the task, one per task. It is
  kept when the task is archived and deleted when the task is deleted or its
  workspace is closed or removed. Saving a record for a task that was deleted
  meanwhile is refused; a task created a moment ago is stored first, then its
  record.
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
- No screen writes or edits the record; one saved before the Handoff tab was
  removed keeps working.
