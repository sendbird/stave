# Workspace Documents

## Summary

A workspace document is a Markdown file an agent writes for you to read and
revise: a plan, a report, a spec, or a proposal. The agent keeps it in the
workspace and edits the same file when you ask for changes. The chat reply
still states the conclusion, the recommended actions and any decision you need
to make, then links the document instead of repeating the whole text. Stave
records every version of each document, shows which documents a turn changed,
and tells the agent when you edited one of its documents between turns.

## When To Use It

- You want to agree on an approach before any code changes: ask for a plan,
  revise it with a few messages, then ask for the implementation.
- You want a report or analysis you can come back to after the conversation
  has moved on.
- You prefer editing the text yourself: change the file in the editor, and the
  agent works from your edit in its next turn.
- You want to check finished work against the plan, or reuse a document from
  another workspace, even one you have deleted.

For a quick answer or an analysis that does not need revising, ask in the chat
as usual; the agent answers there without writing a document.

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
2. The agent writes `.stave/context/plans/<name>.md` and replies with the
   conclusion, the next actions and any decision you need to make. Under its
   reply, **Document updated** lists the file.
3. Select **Open** to read it in the editor, or ask for changes in the chat:
   `Make step 3 more specific.` The agent edits the same file.
4. When it is right, send `Implement the plan.`

## Interface Walkthrough

### Entry Points

- **Under a reply**: the turn's last reply lists every document that turn
  wrote, with its revision number.
- **Information panel → Documents**: every document in the workspace, the most
  recently updated first.
- **`@` in the composer**: documents from your other workspaces, including
  deleted ones, under **Documents from other workspaces**.
- **Review → Load from a document**: a document as the review's criteria.

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
- **Quote Selection in Chat** (editor context menu): select lines in an open
  document and choose it. The lines are added to the chat input as a quote with
  the file path and line numbers; write your comment under the quote.

## Common Workflows

### Revise A Plan Before Implementing It

1. Ask for the plan as a document.
2. Read it with **Open**. Ask for changes in the chat, or edit the file
   yourself and save.
3. Send your next message. If you edited the file, Stave includes your edit as
   a diff, so the agent keeps it instead of writing over it.
4. Ask for the implementation. The agent works from the latest version of the
   document.

### Comment On Part Of A Document

1. Open the document and select the lines you want to change.
2. Right-click and choose **Quote Selection in Chat**. Repeat for other parts.
3. Write a comment under each quote and send. The agent edits the same file.

### Check The Implementation Against The Plan

1. After the implementation, select **Review** in the composer.
2. Under **Check against a plan or acceptance criteria**, select
   **Load from a document** and pick the plan.
3. Start the review. Unmet steps come back as findings you can attach to the
   task. See [Review Tasks](review-tasks.md).

### Reuse A Document From Another Workspace

1. Type `@` in the composer, then part of the document's name or its
   workspace's name.
2. Pick it under **Documents from other workspaces**. A chip shows the title,
   the workspace and the revision.
3. Send the message. The agent receives that revision's text as reference
   material. Select the chip's title to read it.

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
- A revision written during a turn is linked to that turn, whether you sent
  the message or the turn was started by an agent run, a schedule, a
  check-back or the Stave Local MCP. A change made between turns, by you
  or another tool, is recorded as an edit outside a turn.
- When a workspace is deleted, Stave keeps only the newest revision of each of
  its documents, together with the workspace's name, so you can still attach
  it with `@`. Across all deleted workspaces, the 200 most recently updated
  documents are kept.

## Limitations And Advanced Options

- Only Markdown files directly inside the document folders are documents.
- Files larger than 256 KB are not recorded.
- Stave tells an agent about edits only to documents that its own task wrote
  earlier.
- When two turns run in the same workspace at once, the turn that ends first
  records every document changed so far.
- An attached document from another workspace is sent as the revision you
  picked, up to 12,000 characters, not the file as it is now.
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
