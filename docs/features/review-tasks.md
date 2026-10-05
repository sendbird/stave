# Review Tasks

## Summary

The composer's **Review** button runs a review in its own read-only task, on
the provider and model you pick, while the task you are working in keeps
going. When the review finishes, you attach its findings to your next message
in the original task. The conversation you are working in only receives the
review's result, not the reviewer's whole transcript.

## When To Use It

- Before you push: review uncommitted changes or the whole local branch with
  the other provider.
- To get a second opinion on the task's latest answer, such as a plan or an
  analysis, from another model.
- While a long turn is still running: the review starts beside it instead of
  waiting for the turn to end.

A review is a [delegated task](delegated-tasks.md) with read-only access. Use
a compare run when two models should each write a solution, and a delegated
writer when another model should change files.

## Before You Start

- Review tasks need the desktop app. The browser development build has no
  delegation bridge, so its Review button runs a change review in the current
  conversation instead, as before.
- The task's workspace must belong to an open repository.
- At most three subagents of one task run at a time, review tasks included.

## Quick Start

1. In a task's composer, select **Review**.
2. Under **Review**, pick **Uncommitted changes**, **Entire local branch**, or
   **Latest reply**.
3. Under **Review by**, pick the provider, model, and reasoning effort.
4. Optionally pick focus areas, a **Review skill**, and add instructions.
5. Select **Start review**.
6. Keep working. A **Reviewing** line above the composer shows the reviewer
   and the elapsed time.
7. When the review finishes, Stave notifies you; opening the notification
   brings you back to this task. The line reads **Review ready**.
8. Select **Attach**. A task chip for the review joins your draft, and an
   empty draft also receives your **Follow-up Prompt**, by default: "Go
   through the attached review findings. Apply the ones that are valid, and
   for each one you do not apply, explain why." Edit it if you like, and send.

## Interface Walkthrough

### Entry Points

- **Review** in the composer toolbar, or in its overflow tray when the
  toolbar is narrow.
- **Settings → Prompts → Review Tasks** for the defaults.
- **View** on the composer line opens the review over the task you are in.
- The review task itself is listed in the task panel's **Subagents** tab,
  where **View activity** opens the same dialog. **Open** in the dialog, or
  the review's chip on a message, switches to the review task.
- A finished review's notification names the task it reviewed and opens that
  task, where the findings are attached.

### Key Controls

| Control | What it does |
| --- | --- |
| Review target | Uncommitted changes, the entire local branch, a specific commit or range (such as `HEAD~1` or `main..HEAD`), or the task's latest finished reply. Latest reply is unavailable until the task has one. |
| Review by | Any available Claude or Codex model and effort. The suggestion follows **Default Reviewer** in Settings. |
| Focus | Each selected area adds an explicit instruction to the review prompt. |
| Review skill | The reviewer follows the skill's instructions. Only skills the chosen reviewer can load are offered. |
| Also review with | Starts a second, independent read-only review on the other provider at the same time, with that provider's review model. Each review gets its own line. The default follows **Cross-check With Both Providers** in Settings. |
| Additional instructions | Added to this review only, after your saved review instructions. |
| Check against a plan or acceptance criteria | Optional. The reviewer checks the work against what you paste, and each criterion that is not met becomes a finding. |

The line above the composer:

| State | Controls |
| --- | --- |
| Reviewing | **View** the review as it runs, **Stop** it. |
| Review ready | **Attach** the findings, with your follow-up prompt when the draft is empty, **View**, **Dismiss**. |
| Review failed / stopped | **View** to see what happened, **Dismiss**. |

A finished review stays on the line until a message you send carries it, you
dismiss it, or a day passes. Sending other messages meanwhile does not share it.

### See How A Review Went

**View** opens the review in a dialog over the task you are working in, so
checking it never moves you away:

- **Findings**: the reviewer's verdict (approve, approve with changes, or
  request changes) and each finding with its severity (critical, major or
  minor), file and line, detail and suggested fix, most severe first. Tick
  the findings to send and select **Attach N of M**: only those reach the task,
  and the chip reads `N findings`. Opening the dialog again shows the current
  choice; attaching again replaces it.
- **Check fixes**: a new review task, on the same model, that decides for each
  earlier finding whether it is resolved, still unresolved, or outdated
  against the workspace as it is now, instead of reviewing from scratch. Its
  line reads **Fixes checked** with, for example, `2 of 3 fixed · 1 new`.
  Outdated findings are shown separately and do not count as fixed. Missing,
  invalid or conflicting checks read **unchecked**, and the line says
  **Fix checks incomplete**. You can check these findings again.
- **Answer**: the review task's full final reply, rendered as in the
  conversation.
- **Assignment and execution details**: the exact prompt the reviewer got,
  including focus, saved instructions and the skill, plus model, timing and
  setup.
- **Activity log**: each tool call the reviewer made, such as the Git
  commands it ran and the files it read, with their output. While the review
  runs, the log follows it live.
- **Workspace changes**: completed reviews warn when code changed during the
  review or since it finished. Stave compares the commit, staged changes and
  bounded file contents at review start, completion, result access, app
  focus and the result dialog's **Refresh**. A missing or unavailable comparison shows a warning instead of
  claiming the review still covers the current code. Use **Run again** or
  **Check fixes** to review the current changes.
- **Attach to message**, **Run again** (the same prompt on the same model,
  against the workspace as it is now), **Open** (switches to the review task
  for its whole conversation and Task panel), and **Stop** while it runs.

The task chip a review becomes, in your draft or on a sent message, opens the
review task when you select its title.

## Common Workflows

### Cross-check work with the other model

1. Leave **Default Reviewer** on **Other provider**.
2. Select **Review**. The dialog suggests the provider that did not write the
   latest reply.
3. Start the review. The notification and the line say how many findings it
   has, for example `3 findings · 1 critical`.
4. Select **Attach**. The follow-up prompt asks the
   task to apply the valid findings and explain the rest; send it as is.

### Review a plan before it is carried out

1. When the task proposes a plan, select **Review** and pick **Latest reply**.
2. The reviewer receives the reply and the request it answered, checks its
   claims against the repository, and starts with a verdict: agree, agree with
   changes, or disagree.
3. Attach the verdict and decide how to continue.

### Send only the findings worth fixing

1. When the line reads `Review ready · … · 3 findings · 1 critical`, select
   **View**.
2. Untick the findings you disagree with and select **Attach 2 of 3**. The
   follow-up prompt fills an empty draft as usual.
3. Send. The task receives the verdict and the chosen findings, not the whole
   reply.

### Check a fix with the same reviewer

1. After the task addresses the findings, open the earlier review with
   **View**.
2. Select **Check fixes** to confirm each earlier finding is resolved, or
   **Run again** to review the current workspace from scratch with the same
   prompt and model.

### Have both models review the same change

1. In **Review**, tick **Also review with** the other provider's model.
2. Two review lines appear, one per provider. Each finishes on its own.
3. Open each with **View** and attach the findings you agree with from either.

### Check a commit against its acceptance criteria

1. Pick **Specific commit** and enter the commit or range.
2. Paste the criteria under **Check against a plan or acceptance criteria**.
3. Start the review. Unmet criteria come back as findings named after the
   criterion.

### Apply a team checklist to every review

1. Add the checklist as a skill in the repository or your shared skills.
2. In **Settings → Prompts → Review Tasks**, pick it as **Review Skill**.
3. Every review now follows it. You can still pick another skill, or none, in
   the dialog.

## Files And Data

- `settings.reviewTask` holds the defaults:

```json
{
  "reviewer": "other",
  "modelClaude": "",
  "modelCodex": "",
  "focuses": ["correctness", "tests"],
  "instructions": "",
  "skillSlug": "",
  "followUpPrompt": "Go through the attached review findings. Apply the ones that are valid, and for each one you do not apply, explain why.",
  "crossCheck": false
}
```

An empty model follows the provider's default model. Saved instructions are
limited to 4,000 characters and the follow-up prompt to 2,000. An empty
follow-up prompt attaches the findings only.

- The review task is an ordinary Stave task, kept under the reviewed task
  instead of in workspace task lists.
- Dismissing a finished review remains in effect after Stave restarts. It only
  hides that review's composer line in the repository, workspace and task where
  you dismissed it; its task, transcript and Subagents entry remain available.
  Stave stores this lightweight UI preference locally and removes expired
  dismissal records as reviews pass the shelf's one-day lifetime. If storage
  fails, Stave hides the line for the session and warns that it may return after
  a restart.

## Limitations And Advanced Options

- Findings come from a fenced `stave-review-findings` JSON block that every
  review prompt asks the reviewer to end with. A reply without a readable
  block is shown as `findings unreadable`, never as `No findings`; its whole
  answer can still be attached. A narrowed chip whose findings can no longer
  be read sends the whole latest reply instead.
- Only the block that ends the reply counts, so a quoted example earlier in
  the answer is ignored. Up to 50 findings are read; an unknown severity is
  treated as major.
- **Check fixes** quotes the earlier findings and up to 12,000 characters of
  the earlier instructions. The re-check repeats every unresolved finding with
  its original id, so the next **Check fixes** still includes it. Stave reads
  the requested IDs from the saved prompt, counts each once, and keeps
  missing or invalid checks as unchecked. Checks for unrequested IDs show a
  warning and do not affect the requested totals. Unresolved or unchecked
  originals remain available for another check even when the answer omits
  them; selecting findings to attach still sends only the current answer's
  findings.
- Chosen findings belong to the reply they were read from. If the review task
  gets another turn before you send, the whole newest reply goes instead.
- Reviews started before findings existed show no findings list rather than
  `findings unreadable`.
- Reviews without recorded workspace fingerprints cannot establish unchanged
  code. Large or changing workspaces may make the comparison unavailable.

- The reviewer cannot change files. Stave applies the provider's read-only
  posture described in [Read-only consults](delegated-tasks.md#read-only-consults);
  the review prompt says so as well. Neither posture blocks web search: a
  Claude reviewer may use web fetch and web search, and a Codex reviewer, whose
  shell has no network, follows the web search setting in its Codex
  configuration. The dialog says so for a **Latest reply** review, whose reply
  is passed as data to evaluate rather than instructions.
- **Attach** sends the review task's latest reply, up to 6,000 characters,
  keeping its beginning and end. Stave does not push the review into a turn
  any other way: the task's Subagent results list it, but hold its answer
  until you attach it. This is not a hard barrier; an agent that looks up its
  subagents with the delegation tools can still read the answer.
- A **Latest reply** review receives that reply, up to 8,000 characters, and
  the request it answered, as data to evaluate rather than instructions.
- A skill's instructions are included in the review prompt, up to 24,000
  characters. Acceptance criteria are included up to 8,000 characters.
- A commit or range starts with a letter or digit and may only contain
  letters, digits and `. _ / ~ ^ @ { } -`.
- **Also review with** is not offered for **Latest reply**, whose reviewer is
  already the other model. A cross-check runs without the review skill when
  its provider cannot load it.
- A cross-check counts as a second subagent of the task, so it shares the
  limit of three running at a time.
- **Run again** of a **Latest reply** review reviews the same reply again, not
  a newer one. Start a new review for the newest reply.
- Delegation keys starting with `stave-review-` are reserved for these
  reviews; an agent's own delegations cannot use them.

## Troubleshooting

### The review does not start

- Symptom: an error toast after **Start review**.
- Cause: three subagents of this task are already running, the chosen skill is
  not available to that reviewer in this workspace, or the task has no
  repository.
- Fix: wait for a running subagent, pick another skill or none, or open the
  task's project.

### Latest reply is unavailable

- Symptom: the **Latest reply** card is disabled.
- Cause: the task has no finished reply yet.
- Fix: wait for the current turn to finish.

## Related Docs

- [Delegated Tasks](delegated-tasks.md)
- [Attachments](attachments.md)
- [Skill Selector](skill-selector.md)
- [Turn Activity](turn-activity.md)
