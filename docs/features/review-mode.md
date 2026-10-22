# Review Mode

## Summary

- Review shows a task's work in one place: the files it changed against a
  fixed scope, the selected file's diff, and the completion checks, Lens
  checks and diff comments that bear on the decision.
- Each scope says what it compares and what it cannot show, so a review never
  reads as covering more than it does.

## When To Use It

- After an agent turn, to read what changed before you continue.
- When an agent run stage finishes, to read that stage's changes apart from
  anything changed after it.
- Before you open or update a pull request, to read everything on the branch.
- For line-level feedback, Review's **Comment** opens the editor's diff, where
  comments anchor to lines ([Diff review comments](diff-review-comments.md)).

## Before You Start

- Review reads the task's workspace with Git. The stage, branch and
  uncommitted scopes need the workspace's repository; the turn scope needs
  only the conversation.
- The stage scope appears when the task has an agent run
  ([Agent runs](agent-runs.md)).

## Quick Start

1. Open a task.
2. Choose **Review** in the **Conversation | Review** switch at the top of the
   task, or press `Cmd/Ctrl+Alt+R`.
3. Pick a file in **Changed files** to read its diff.
4. Choose **Conversation** (or press the shortcut again) to go back. The
   conversation keeps its place while Review is open.

## Interface Walkthrough

### Entry Points

- The **Conversation | Review** switch at the top of every task.
- `Cmd/Ctrl+Alt+R` switches the active task, bringing it to the front when
  another tab has focus ([Keyboard shortcuts](keyboard-shortcuts.md)).
- **Review changes** on an agent run's sign-off card opens Review on the stage
  the sign-off is about ([Agent runs](agent-runs.md)).
- **Review** on a row in the task's **Outputs** opens Review on that output's
  turn ([Agent performance and task outputs](results.md)).

Opened from a sign-off, Review starts on that stage; otherwise it starts on
the task's latest finished turn.

Review is not saved across restarts: every task opens on its conversation.

### Key Controls

- **Scope**: **This turn**, **This stage** (with an agent run), **Branch** or
  **Uncommitted**. Next to it, Review names the scope's base and the revision
  it reads now, for example
  `Since abc1234, where the stage started, to the working tree at 9f8e7d6`.
  **Refresh changes** reads the scope again.
- **This turn** opens on the task's latest finished turn and lists the edits
  the agent reported. Changes made through shell commands are never reported,
  so they are not here; **Uncommitted** or **Branch** shows every change.
- **This stage** lists the Git diff since the stage's start commit, with
  committed, uncommitted and untracked files, grouped as **This stage** and
  **After the stage** by the paths the stage recorded when it reported. A
  later edit to one of the stage's own files cannot be told apart from the
  stage's edit, and Review says so. A stage that ran before Stave recorded
  paths shows its files as **Not attributed**.
- **Branch** compares the working tree with where the branch left the default
  branch (`origin/main` or `origin/master`, else local `main` or `master`).
- **Uncommitted** compares the working tree with `HEAD`.
- **Changed files** shows each file's status and line counts. Opening a file
  marks it read (`2 of 5 read`); reading a file is not reviewing the task.
  Up and Down move through the list.
- **Output** under the files shows the turn's saved answer and whether it was
  marked reviewed, or the stage's report.
- The diff shows the selected file. **Comment** opens it in the editor's diff,
  where you add line comments.
- **Completion checks** shows the run's **Done when** criteria with the checks
  Stave ran, such as `Stave checks: 1 of 2 passed (lint); still needed: test`.
  Passing checks are not a review or a sign-off.
- **Approvals** counts the scope's permission requests by who allowed them
  (you, a Stave rule, the provider's permission mode), and any denied,
  waiting or withdrawn; a request delivered twice counts once.
  Below the counts, each request names what was asked (`Bash · bun test`), who
  decided (you, your trusted tools, autonomous mode, the permission mode,
  Stave after no answer in time) and when; the latest 50 are listed. **This
  turn** covers the turn, **This stage** the turns the stage ran, and the
  other scopes the whole task. Requests answered before Stave kept this record
  say who decided was not recorded.
- **Lens checks** lists the task's saved Lens comparisons with their verdict;
  **Show comparison** opens the before and after images.
- **Diff comments** repeats the task's comments, not sent and sent, because
  the editor's comment areas are not reachable by screen readers.
- The decision bar at the bottom says where the decision stands and offers it:
  - In **This stage**, while the run waits for your sign-off: **Sign off**, or
    **Ask for changes** with a note that runs the last AI stage again. After
    the decision it shows **Signed off** or **Changes asked** with the time.
  - In the other scopes: **Mark reviewed** marks the turn's output reviewed,
    and **Send comments** sends the pending diff comments to the agent.

Four things stay apart: a file **read** in Review, completion checks that
**passed**, an output marked **Reviewed**, and a stage **Signed off**. None of
them implies another.

## Common Workflows

### Read A Turn's Edits

1. Switch to **Review**; it opens on the latest finished turn.
2. Read each file; switch to **Uncommitted** to include shell edits.

### Read A Stage's Changes Apart From Later Ones

1. Switch to **Review** and choose **This stage**.
2. Read the files under **This stage**; anything under **After the stage**
   changed after the stage reported.

### Review And Sign Off A Stage

1. When a stage waits for your sign-off, choose **Review changes** on its
   card.
2. Read the stage's files, check **Completion checks** and **Lens checks**.
3. Choose **Sign off** to continue the run, or **Ask for changes**, write
   what should change and choose **Send and run again**.

## Files And Data

- Review keeps no data of its own apart from the **Mark reviewed** decision,
  which is saved with the turn's output. Its scope and read marks last for
  the session; the conversation, result reviews, Lens records and comments
  keep their own storage. **Approvals** reads the approval record kept with
  the conversation's messages: a turn, or a stage's turns, from saved history
  when the open conversation no longer holds them (it shows a loading state
  and a retry if the read fails); **Branch** and **Uncommitted** from the
  messages Stave has loaded for the task.

## Limitations And Advanced Options

- The turn scope cannot show shell edits.
- In the stage scope, a later edit to one of the stage's own files, or an
  untracked file that existed before the stage, cannot be told apart.
- Review lists up to 2,000 changed files and opens files up to 512 KB per
  side; larger changes need Git directly.
- A link in the workspace is opened only when its target is inside the
  workspace; a link that leads outside is listed but not opened.

## Troubleshooting

### Review says a stage has no recorded start commit

- Symptom: **This stage** shows an error instead of files.
- Cause: the stage never started a turn, or its workspace could not be read
  when it began. Use **Branch** or **Uncommitted** instead.

## Related Docs

- [Agent runs](agent-runs.md)
- [Diff review comments](diff-review-comments.md)
- [Agent performance and task outputs](results.md)
- [Lens](lens.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
