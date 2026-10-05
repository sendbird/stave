# Agent performance and task outputs

Use **Agent performance** in the left navigation to understand how delegated
work has been going across workspaces. Use **Outputs** in a task's Task panel
to read that task's saved answers and file changes and choose a follow-up.
These screens used to share the name **Results**. Their scope and purpose differ.

| Question | Open | What to look for |
| --- | --- | --- |
| How often does an agent finish its assignment? | Agent performance | Completion rate, ended run count and stop reasons. |
| What effort does delegation take? | Agent performance | Completion time, reported spend and follow-ups, together. |
| What did this task produce? | Task → Outputs | Saved answer and reported file changes. |
| Have I checked this answer, or do I want another change? | Task → Outputs | Check mark and Draft follow-up. |
| What happened during execution? | Task → Activity, or View execution from an output | Prompt, tools and answer for the execution. |

## Agent performance

Open **Agent performance** from the left navigation, the Fleet header, or
**Open agent performance** in the command palette. Choose 7, 30 or 90 days.
Use **Refresh agent performance** to fetch the latest sample.

The overview shows:

- **Completion rate**: completed runs divided by all ended runs in the sample.
  Both **Completed without change request** and **Completed after change
  request** count as completed. A workflow change request is a recorded event;
  neither outcome proves that the answer is correct or has passed code review.
- **Median completion time**: the median elapsed time from creation to end for
  both completed outcomes. It includes waiting time, rather than measuring only
  model execution time. Failed and cancelled runs do not enter this median.
- **Reported spend**: the sum of known reported costs for all sampled runs,
  including failed and cancelled ones. Coverage says how many runs reported a
  cost. An unknown cost is excluded; it is not treated as a free run. No reported
  costs produce a dash, while a reported zero remains zero.
- **Follow-ups per run**: the average number of retained replies, workflow change
  requests and reminders. A reminder can be automatic; a reply can be guidance.
  This is not a count of defects or solely of user corrections.
- **Why runs did not complete**: failed and cancelled runs grouped by their
  recorded stop reason.
- **By agent**: completion rate, sample size, median reported cost and average
  follow-ups for each agent name or saved workflow name. Expand a row and select
  one of its ten most recent runs to read its report. Different providers can
  appear in the same named group.

**Data scope and definitions** explains the bounds. The sample starts with the
200 most recently created agent runs across all workspaces, then keeps runs
that ended in the selected period. Active runs and ordinary chat turns are
excluded; saved workflow runs are included. Outcome classifications and
follow-ups use up to 2,000 retained events per run. A longer period does not
recover older runs outside this sample.

Treat these as operational signals. Incomplete cost coverage prevents a fair
provider price comparison; different assignments and small samples also limit
comparisons between agents.

**Example:** An agent has 12 ended runs, 10 completions and two turn-cap stops.
Its completion rate is about 83%. Inspect the stopped reports to see whether
scope or turn limits need adjustment. Read the outputs and verification evidence
before deciding that the ten completed assignments delivered good work.

**Example:** An agent completes reliably but needs many follow-ups. Read recent
reports to see whether clearer assignments would help. More follow-ups alone
do not establish poor quality.

## Task outputs

Open the task's **Task** panel and select **Outputs**. This history includes
ordinary task executions, failed attempts and executions belonging to agent
runs. A multi-turn agent run can produce several task outputs, so counts need
not match the Agent performance screen.

The default **Unchecked** filter shows saved outputs without a check mark.
**All outputs** includes checked items. Each row leads with its answer summary,
execution outcome, date and check state. Expand it to read:

- The saved final answer, with a disclosure for long answers.
- Reported file changes. Saved diffs describe the execution's end state; opening
  a file shows its current contents. Partial diffs or incomplete lists say so.
- **View execution**, for the prompt, tool calls and full answer still retained.
- **Model and routing details**, when the execution's provenance is needed.
- **Mark checked** or **Mark unchecked**, for personal tracking. These do not
  change task status, approve a pull request or validate the answer. The check
  mark persists separately from notifications. Fleet acknowledgements and
  viewing the finished turn long enough can also mark it checked.
- **Draft follow-up**, which appends a reference to this output to the current
  task's existing draft. Describe the changes and send the message yourself;
  selecting this action does not immediately send a request.

If a finished agent run has a report, **Agent run report and actions** keeps that
run-level summary and its existing actions available in a collapsed disclosure.
It does not replace the saved task answers below it.

**Example:** After a settings change, open Outputs to read the saved answer and
inspect its diffs. Mark it checked after reading it, or draft a follow-up while
preserving an existing note in the composer.

**Example:** A file changed again after yesterday's execution. Read yesterday's
saved diff in Outputs to understand what that execution recorded, and use the
file editor or source control for the file's current state.

For live work, see [Turn Activity](turn-activity.md). For delegated runs and their
reports, see [Agent Runs](agent-runs.md).
