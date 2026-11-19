# Coordinator Trial

A one-week side-by-side trial of a different shape for Tars's planner: an
ordinary task that runs as a saved Agent and coordinates work with the tools
Stave already has, used next to today's Tars and compared with numbers. The
trial adds no product surface. Tars itself gets no new behavior while it runs.

## What the coordinator needs, and where it already is

The coordinator needs five capabilities. Each exists today for a task that runs
as a saved Agent on Claude or Codex with the Local MCP server on.

| Capability | Existing tool | Limit that shapes the setup |
| --- | --- | --- |
| Start work | `stave_delegate_task` with `agentConfigId` (`implementer`, `debugger` or `ui-polisher`) and no `lifecycle`: a supervised Agent run in its own worktree. A review is `stave_delegate_task` with `agentConfigId: "reviewer"` and `access: "read-only"`. | A delegated run has no review stage of its own (`buildDelegatedAgentRunInput` turns **Review before done** off), so the coordinator asks for the review. One brief is at most 8,000 characters. |
| Read status | `stave_list_delegated_tasks` (state, end reason, bounded answer) and `stave_get_task`; the real diff through `git` in the shell, since every worktree shares the repository's commits. | The list returns no transcripts; open the child task to read one. |
| Message a task | `stave_follow_up_delegated_task` while a child's stage waits for its manager; `stave_run_task` with the child's `taskId` once its run ended, for example to fix review findings on the same branch. | You can also write in any child task yourself. Stave records that reply the same way as a coordinator follow-up. |
| Check back later | Inside the coordinator's own run, `stave_wait_for_event`: `delegated_completion`, `pull_request_checks` or `pull_request_review` with the child's pull request URL as `target`, or `time`. Between runs, `stave_create_wake_up` on the coordinator task. A finished child's answer also arrives with the next turn. | Stave refuses a wake-up on a task while an agent run is active on it, so inside a run only `stave_wait_for_event` works. One wait at a time, at most 20 wakes, at most 7 days, and each wake is a turn from the run's budget. |
| Check the draft PR | `gh pr view <url> --json isDraft,state,baseRefName,headRefName,headRefOid,statusCheckRollup`, `gh pr diff <url>` and `gh pr checks <url>` through the shell. | Needs `gh` signed in. The writing child opens the draft PR itself, with `gh pr create --draft`. |

No gap blocks the trial. These limits shape the setup:

- **Team limits.** Each run of the coordinator has 3 helper Agents at once, 8
  in total, and one shared turn budget that its helpers draw from (see
  [Team limits](../features/agents.md#team-limits)). The definition below
  raises max turns to 100. A request that needs more units than that becomes
  a second request.
- **Denied tools pass to helpers.** A Claude Agent's denied tools become the
  turn's denied tools, and a same-provider helper inherits them
  (`electron/providers/runtime.ts`, `resolveDelegationPermissionPolicy`).
  Denying `Edit` or `Write` on the coordinator would stop its Claude
  implementers from editing. Deny only what no helper should do either.
- **Tool limits on Codex.** Stave enforces a main agent's denied tools on
  Claude only. On Codex they are only instructions, so run the coordinator on
  Claude.
- **Read-only cannot delegate writers.** A delegation never runs wider than
  the delegating Agent, so the coordinator needs Auto permission. It keeps its
  own workspace clean by instruction.

## The coordinator agent

Create it once (about a minute):

1. **Agents** → **New agent** → under **Or start blank**, name it
   `Coordinator trial` → **Start blank**. The name gives the agent the id
   `coordinator-trial`, which the measuring script uses by default.
2. Fill in the editor:

| Field | Value |
| --- | --- |
| Use when | Coordinating several units of work in this repository to verified draft pull requests during the coordinator trial. |
| Instructions | The text below |
| Workflow → Review before done | Off (it reviews each unit itself) |
| How it runs → Model | Fixed: Claude, `claude-opus-5-5`, effort high |
| How it runs → Permission | Auto |
| How it runs → Works in | Current workspace |
| Advanced → Denied tools | `Bash(gh pr merge:*)`, `Bash(gh pr ready:*)`, `Bash(gh release:*)`, `Bash(git push --force:*)`, `Bash(git push -f:*)` |
| Advanced → Max turns | 100 |
| Advanced → Usable as | Main agent |
| Advanced → Can call | Implementer, Debugger, UI Polisher, Reviewer, Researcher |

The denied tools match command prefixes. The instructions and Stave's Agent
guardrails (force-pushing a default or protected branch, deleting remote
branches, publishing) cover other spellings. Leave Shipper out: it enables
auto-merge.

Instructions:

```text
You coordinate work in this repository. You do not write code yourself: never edit files, commit or push in your own workspace.

1. Own the goal. Restate it with its acceptance check before you start, and keep it until every unit is verified or you can say why it cannot be.
2. Give each independent unit one owner with stave_delegate_task: agentConfigId implementer for a change, debugger when the cause is unknown, ui-polisher for a visual fix; a new worktree; one delegationKey per unit. The brief states the goal, scope, acceptance checks and base branch, and tells the owner to commit, push its branch, open a draft pull request against the base with `gh pr create --draft`, and put the pull request URL in its report. Do small or tightly coupled work as one unit.
3. A report is a claim. When a unit returns, check it yourself: `gh pr view <url> --json isDraft,state,baseRefName,headRefName,headRefOid,statusCheckRollup`, `gh pr diff <url>`, and the branch head with git. The pull request must be a draft, on the agreed base, at the owner's latest commit, with checks you have read. Then ask for an independent review with stave_delegate_task: agentConfigId reviewer, access read-only, on the provider that did not write the change, naming the pull request and commit. Send findings back to the owner with stave_follow_up_delegated_task while it waits, or with stave_run_task on its task once it has ended, and check again.
4. Check back instead of polling. In a run, call stave_wait_for_event (delegated_completion for owners, pull_request_checks with the pull request URL for checks, time for later) and end the turn. Outside a run, use stave_create_wake_up on this task. Never sleep or loop on status calls.
5. Ask the user only for decisions that change scope, correctness or authority, and for credentials or logins. Decide the rest and say what you decided.
6. Never merge, enable auto-merge, mark a pull request ready for review, release, deploy, force-push or delete branches.
7. Report each unit with its pull request link, what changed, the checks and review you saw yourself, and what is left. Then report the stage.
```

**Start it:** open a task in the repository's main workspace, pick
**Coordinator trial** in the composer's agent selector, and send the request.
A send while no run is active starts a run. Later messages in that run reach
the coordinator as replies. Once the run ends, the next request starts a new
run with a fresh budget.

## Trial protocol

**Before the week.** Note the Stave version and the starting date. Do not
change Tars, the coordinator's definition or the helper limits during the
week. Fix a broken coordinator instruction only between weeks, and note it.

**What goes to which.** Hand out new work in arrival order, alternating: the
first request to Tars, the next to the coordinator, and so on. Both work in the
same repository. Do work yourself that you would not hand to either (an urgent
fix, a release). Aim for at least 8 requests on each side.

**What to record.** Keep one line per request in a plain note:

| Date | Side | Request | Units | PR links | You stepped in? Why | Result after your review |
| --- | --- | --- | --- | --- | --- | --- |

"Stepped in" covers any reply you wrote in a child task, a question you
answered, work you stopped or took over, and a step you did by hand. "Result
after your review" is `right`, `needed rework` or `wrong`, judged from the
pull request itself.

**Measure** at the end of the week, on a copy of the database:

```bash
sqlite3 ~/Library/Application\ Support/stave/stave.sqlite ".backup /tmp/stave-copy.sqlite"
bun scripts/measure-coordinator-outcomes.ts /tmp/stave-copy.sqlite --since=2026-11-20 --until=2026-11-27
```

It prints each side's work and then both summaries with the definitions of
[Tars Outcome Numbers](tars-outcomes.md). For the coordinator a unit is one
writing delegation from a task that ran as `coordinator-trial`
(`--coordinator=<agent id>` names another agent). A unit reached a pull
request when a pull request link first appears in its run's stage reports or
in the answer it returned. When the coordinator started nothing in the range,
the script names the agents that did.

**Decision rule.** Replace the planner with the coordinator only when all of
these hold:

1. The coordinator's units reached a pull request or a verified completion
   without you (`unattendedRate`, checked against the note's "stepped in"
   column) more often than Tars's, by at least two requests' worth.
2. No coordinator unit broke a hard rule: a merge, a pull request marked ready,
   a force push, a write in its own workspace, or a pull request reported as
   checked that was not a draft on the agreed base at the owner's commit.
3. Your review found no more `needed rework` or `wrong` results than for Tars.
4. Median time to a pull request is not more than half again Tars's.

Keep the planner when the coordinator is equal or worse on 1 or 3, or breaks a
rule in 2. Better numbers within one or two requests are noise: run a second
week before deciding.

**Limits of the comparison.**

- **Small sample.** With 8 requests a side, one request moves a rate by about
  12 points. Read counts, not percentages.
- **Different mix.** Alternating spreads the work but does not match it; one
  hard request can decide a side.
- **Different units.** Tars counts a request it took on; the coordinator
  counts each unit it delegated, and may split one request into several. The
  note's per-request lines compare like with like.
- **Different evidence of a pull request.** Tars records the pull request it
  opened and watched; for the coordinator the script reads a link in the
  child's report or answer, and the coordinator's own check is what verifies
  it. The note's PR links settle disagreements.
- **Replies are not attributed.** Stave records your reply in a child task the
  same way as a coordinator follow-up, so only sign-offs count as decisions in
  the script. The note's "stepped in" column is the full count.
- **Clock start.** Both clocks start after planning: when Tars took on the
  work, and when the coordinator delegated the unit.
- **Not measured.** Correctness beyond your review, usage and cost, and the
  time you spent reading results.
