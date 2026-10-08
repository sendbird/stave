# Workspace Documents

## Summary

A workspace document is a Markdown file an agent writes for you to read and
revise: a plan, a report, a spec, or a proposal. The agent keeps it in the
workspace and edits the same file when you ask for changes, so the chat holds
a short summary instead of the whole text again. Stave records every version
of each document, shows which documents a turn changed, and tells the agent
when you edited one of its documents between turns.

## When To Use It

- You want to agree on an approach before any code changes: ask for a plan,
  revise it with a few messages, then ask for the implementation.
- You want a report or analysis you can come back to after the conversation
  has moved on.
- You prefer editing the text yourself: change the file in the editor, and the
  agent works from your edit in its next turn.

For a quick answer that does not need revising, ask in the chat as usual.

## Before You Start

- Documents live in the workspace's `.stave/context/plans/` folder (older ones
  in `.stave/plans/` are listed too). The file tree hides `.stave/`, so open
  documents from a reply or the Information panel.
- Add `.stave/` to the repository's `.gitignore` if documents should not be
  committed.
- Revision history needs the desktop app.

## Quick Start

1. Ask for the document, for example
   `Write a plan for the retry change as a document. Do not edit code yet.`
2. The agent writes `.stave/context/plans/<name>.md` and replies with a short
   summary. Under its reply, **Document updated** lists the file.
3. Select **Open** to read it in the editor, or ask for changes in the chat:
   `Make step 3 more specific.` The agent edits the same file.
4. When it is right, send `Implement the plan.`

## Interface Walkthrough

### Entry Points

- **Under a reply**: the turn's last reply lists every document that turn
  wrote, with its revision number.
- **Information panel → Documents**: every document in the workspace, the most
  recently updated first.

### Key Controls

- **Open** opens the document in the editor. You can edit and save it there.
- **Changes** opens a read-only diff of that revision against the one before
  it. In the Information panel the compare icon does the same for the newest
  revision.
- **v3** is the revision number. Hover it in the Information panel to see how
  many revisions are recorded.
- **New plan** creates a plan document from a short template.
- The checklist icon turns the document's checklist items into workspace
  todos.

## Common Workflows

### Revise A Plan Before Implementing It

1. Ask for the plan as a document.
2. Read it with **Open**. Ask for changes in the chat, or edit the file
   yourself and save.
3. Send your next message. If you edited the file, Stave includes your edit as
   a diff, so the agent keeps it instead of writing over it.
4. Ask for the implementation. The agent works from the latest version of the
   document.

### See What A Turn Changed In A Document

1. Find **Document updated** under the turn's reply.
2. Select **Changes**. The diff shows the previous revision on the left and
   that turn's revision on the right.

## Files And Data

- The file in `.stave/context/plans/` is the current version. Edit it like any
  other file.
- Each version is also stored as a revision in Stave's local database, up to
  the 50 newest per document. A revision is recorded when a turn ends and
  before each message you send, only when the content changed.
- A revision written during a turn is linked to that turn. A change made
  between turns, by you or another tool, is recorded as an edit outside a turn.
- Revisions are removed with their workspace.

## Limitations And Advanced Options

- Only Markdown files directly inside the document folders are documents.
- Files larger than 256 KB are not recorded.
- Stave tells an agent about edits only to documents that its own task wrote
  earlier.
- Changes made by a turn Stave did not observe, such as one started from the
  Stave Local MCP, are recorded as edits outside a turn.
- Stave has no separate plan mode. To keep a turn from editing anything, ask
  for a document only, or use a read-only setup such as Codex `read-only` file
  access or the read-only Researcher agent. See
  [Runtime Safety Controls](provider-sandbox-and-approval.md).

## Troubleshooting

### A document does not show under the reply

- Symptom: the agent says it wrote a document, but no **Document updated**
  list appears.
- Cause: the file is outside `.stave/context/plans/`, is not a Markdown file,
  or did not change during the turn.
- Fix: ask the agent to save it as `.stave/context/plans/<name>.md`.

### The agent ignored my edit

- Symptom: the next turn overwrote text you changed in the file.
- Cause: the file was not saved before you sent the message, or the document
  was written by a different task.
- Fix: save the file, then send your message from the task that wrote the
  document.

## Related Docs

- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Review Tasks](review-tasks.md) for checking an answer or a plan with
  another model
- [Agent performance and task outputs](results.md)
