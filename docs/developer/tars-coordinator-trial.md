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
| Start work | `stave_delegate_task` with `agentConfigId` (`implementer`, `debugger` or `ui-polisher`) and no `lifecycle`: a supervised Agent run in its own worktree. A review is `stave_delegate_task` with `agentConfigId: "reviewer"` and `access: "read-only"` in a new worktree started at the commit to review (see [The independent review](#the-independent-review)). | A delegated run has no review stage of its own (`buildDelegatedAgentRunInput` turns **Review before done** off), so the coordinator asks for the review. One brief is at most 8,000 characters. |
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
  Claude only. On Codex they are only instructions, so the coordinator prefers
  Claude and starts from a Claude task. A routing rule that names Codex still
  outranks the preference; check that each run started on Claude and note it
  when it did not.
- **A pinned model keeps the whole team on one provider.** A **Fixed** Agent
  model, or a model pinned in the composer, locks the run's model, and then
  every helper must stay on the run's provider
  (`helperKeepsParentProvider`). A Fixed Claude coordinator therefore cannot
  get a Codex review: the Reviewer prefers the other provider, and Stave
  refuses the helper ("The helper must keep the parent's provider"). The
  coordinator's model is **Auto** for that reason.
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
| How it runs → Model | Auto, preferred provider Claude (not Fixed: see above) |
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
3. A report is a claim. When a unit returns, check it yourself: `gh pr view <url> --json isDraft,state,baseRefName,headRefName,headRefOid,statusCheckRollup`, `gh pr diff <url>`, and the branch head with git. The pull request must be a draft, on the agreed base, with the owner's branch as head, at the owner's latest commit, with checks you have read. Then ask for an independent review with stave_delegate_task: agentConfigId reviewer, access read-only, provider set to the provider the owner did not run on (its providerId in stave_list_delegated_tasks), workspace { mode: "new-worktree", name: "review-<unit>-<first 7 characters of the commit>", fromBranch: "<the full commit id>" }, and a brief naming the pull request, the base and the full commit id. Do not pass expectedHead: Stave accepts it only in this workspace, which is not at that commit. Send findings back to the owner with stave_follow_up_delegated_task while it waits, or with stave_run_task on its task once it has ended, and check again.
4. Check back instead of polling. In a run, call stave_wait_for_event (delegated_completion for owners, pull_request_checks with the pull request URL for checks, time for later) and end the turn. Outside a run, use stave_create_wake_up on this task. Never sleep or loop on status calls.
5. Ask the user only for decisions that change scope, correctness or authority, and for credentials or logins. Decide the rest and say what you decided.
6. Never merge, enable auto-merge, mark a pull request ready for review, release, deploy, force-push or delete branches.
7. Report each unit with its pull request link, what changed, the checks and review you saw yourself, and what is left. Then report the stage. In that report, add one evidence item per pull request you verified in step 3: kind link, ref the pull request URL, label "Verified draft PR, head <the owner's branch>". List no other pull request that way.
```

**Start it:** open a task in the repository's main workspace on Claude, pick
**Coordinator trial** in the composer's agent selector, leave the composer's
model on Auto, and send the request. A model pinned in the composer locks the
run like a Fixed model and blocks the Codex review.
A send while no run is active starts a run. Later messages in that run reach
the coordinator as replies. Once the run ends, the next request starts a new
run with a fresh budget.

### The independent review

Implement, then review on the other provider, works with the settings above
and this call for the review (an owner that ran on Claude, commit `3f9c2a1…`):

```json
{
  "agentConfigId": "reviewer",
  "access": "read-only",
  "provider": "codex",
  "delegationKey": "review-search-3f9c2a1",
  "workspace": { "mode": "new-worktree", "name": "review-search-3f9c2a1", "fromBranch": "3f9c2a1d…(full commit id)" },
  "prompt": "Review commit 3f9c2a1d… of https://github.com/<owner>/<repo>/pull/<n> against <base>. …"
}
```

- **Provider.** Only an unpinned coordinator can start a helper on the other
  provider; a Fixed model or a composer pin makes Stave refuse it
  (`reserveChildResources` in `electron/persistence/agent-run-store.ts`).
  Name the provider explicitly: the Reviewer's own preference is the provider
  the coordinator is on, which is the owner's provider too when the owner ran
  on Claude.
- **Workspace.** Without `workspace`, a read-only delegation runs in the
  coordinator's workspace, which is not at the owner's commit, and the
  Reviewer stops on the mismatch as its instructions say. `expectedHead` does
  not help: Stave accepts it only for the same workspace and does not start
  the child when that workspace's HEAD differs. A new worktree whose
  `fromBranch` is the commit id starts exactly at that commit (Stave passes it
  to `git worktree add` as the start point), so the Reviewer's own check
  passes. Stave does not enforce the commit there; the Reviewer's check does.
- **Not possible without a product change:** a Fixed (or composer-pinned)
  coordinator with a review on the other provider. The smallest change would
  let a helper that names another provider run on that provider's own catalog
  even when the parent's model is pinned, that is, have
  `helperKeepsParentProvider` stop treating `modelLocked` as a team-wide
  provider pin. The trial does not need it.

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
writing delegation made while its task ran as `coordinator-trial`
(`--coordinator=<agent id>` names another agent); a delegation the same task
made before or after it ran as another agent is not counted. Everything
counted for a unit is its own: when a follow-up delegation goes into the same
child task, each turn, report and sign-off belongs to the delegation that was
the newest when it happened. A unit reached a pull request only when all of
these hold:

- The unit itself gave the link, in a completed stage report or in the answer
  it returned, and no earlier delegation gave that link first. A pull request
  counts once, for the delegation that opened it; work that continues it on a
  reused branch is `completed`.
- A completed report of the coordinator's task lists the same link as verified
  with the unit's branch as head (step 7 of its instructions), and was written
  after the unit gave the link and before the task stopped running under the
  assignment that delegated the unit. An earlier report, or one by another
  agent the task ran as before or after, verifies nothing for the unit.
- The pull request is in the repository the work ran in (its `origin` remote).

A failed unit, one whose latest report is blocked, or one you took over never
reached one: a taken-over unit is `taken-over` even with a verified pull
request, and one you took over and handed back counts as `humanDecided`. The
time to a pull request is when the unit first gave the link. When the
coordinator started nothing in the range, the script names the agents that
did.

`--since` and `--until` take a calendar day of this machine's time zone
(`--until=2026-11-27` in Seoul ends at Seoul midnight) or a time with an
offset (`2026-11-27T00:00+09:00`); the end is exclusive.

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
  opened and watched; for the coordinator the script reads the link the child
  gave and the coordinator's own record that it checked it. The script cannot
  see whether that check was right (draft, base, head); the note's PR links
  settle disagreements.
- **Replies are not attributed.** Stave records your reply in a child task the
  same way as a coordinator follow-up, so only sign-offs and takeovers count as
  stepping in for the script. The note's "stepped in" column is the full count.
- **Clock start.** Both clocks start after planning: when Tars took on the
  work, and when the coordinator delegated the unit.
- **Not measured.** Correctness beyond your review, usage and cost, and the
  time you spent reading results.
