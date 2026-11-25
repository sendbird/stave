# Delegated Tasks

## Summary

A task can hand work to a **subagent**. The durable kind is a **delegated
task**: a real Stave task created on its behalf, optionally on the other
provider and in its own worktree. The delegation is recorded on the run ledger,
so the parent can trust what it is told about the child — including after a
restart — and the child's answer comes back to the parent on its own.

## Results in the conversation

The message that launched a subagent shows **Subagent results** outside its collapsed
trace summary. Its heading shows the number of subagents. Each subagent is an Atelier UI
run monitor card, and several cards sit side by side, wrapping into rows when the column is
narrow. A live card shows its identity, current work with its observed duration, and reported
history. Progress shows on the agent it names, including one moved to the background; a resumed agent's row shows only progress of that run; progress naming an agent that is not on a row stays off every row. Progress that names no agent shows on the only running agent; while several run, it stays off their rows. A returned result or failure shows a preview with any observed duration. Select
**View result** to read the original answer and execution details; the open card takes the
whole row. **View progress** opens the subagent in the [Agent panel](#the-agent-panel)
beside the conversation.
Unknown durations and costs are omitted. Reported history is narration, not a count of
completed tool calls. The composer keeps its compact subagent summary. **Result received** confirms arrival, not incorporation into
or verification of the parent answer. A pending asynchronous launch is not a completed result.

For a durable child, **Open task** opens its conversation. A current question or approval
changes that action to **Answer in the subagent task** or **Review approval in the subagent task**.
Retry and stop controls remain in the existing task surfaces. Results from a different retry
or child turn do not replace the recorded result in an older message. Native tool records
without a turn identity remain available in work history.

## When To Use It

- For a task that should keep running on its own schedule while the parent moves
  on, and that must survive quitting and reopening Stave.
- For handing a piece of work to the other provider (a Claude task delegating to
  a Codex child, or the reverse).
- For work that should be isolated in its own worktree instead of sharing the
  parent's checkout.
- For a second opinion, a review or research from another model. A
  [read-only](#read-only-consults) child never changes files and never asks
  for approval, so several can run beside each other and beside other work in
  the same workspace.

An agent's **in-turn subagents** (its `canCall` agents, run by the provider
inside the turn) cover work that only needs to last for the current turn; they
never survive a restart. Prefer a **schedule** (Schedules, start a task) when
the work should recur rather than be handed off once.

## Before You Start

- The **Subagents** tab of the right rail's Task panel lists every subagent the
  task called, durable or in-turn. Delegation requires the Stave Local MCP
  server (Settings → MCP → Local MCP Server).
- The parent task's workspace must belong to a registered repository. A delegation
  is refused when the parent task, its workspace, and the repository path do not
  agree.

## Quick Start

Assigning work to a saved Agent without naming a lifecycle starts its existing
Run supervisor. The first response ending does not complete the assignment:
the Run requires stage reports and its acceptance checks, and continues until
it is accepted, on Claude and Codex alike. A turn count does not end it: like a
primary run it is bounded by time and provider usage, and it stops only if it
loops (200 turns without finishing, shared with a parent's team, which keeps
one turn free for the parent to integrate). It then ends and its parent reads
what it finished. Prompts are limited to the existing
Run's 8,000-character assignment size. Missing reporting tools or unsupported
supervision is reported as a failure; it never silently becomes a single turn.

The delegated Agent keeps the frozen definition and host-resolved permissions
on every continuation, including stage replies. Outside an adaptive team its
admitted model/effort remain fixed. In an adaptive team permitted resources can
change within the frozen parent/member pins, provider, account and catalog;
permissions cannot widen. A
workflow does not grant publication permission, and sign-off cannot widen a
read-only delegation. Open the child's task to answer a block, sign off or use
its Run controls. When its Run stops for a person (a stuck or blocked stage),
the parent can also answer it with Follow-up, which continues that stage with
the admitted permissions; Detach stays reserved for other lifecycles;
Stop cancels supervision and the active provider turn. A run stopped as a
likely loop before acceptance leaves a failed assignment with its progress, not
a completed result.
The parent still owns integration and acceptance of the overall work.

Ask the agent in the parent task to delegate, for example:

> Get a read-only second opinion on this plan from Codex.

The agent calls `stave_delegate_task`. A read-only call waits for the answer
(up to two minutes by default, three at most) and returns it as `child.result`.
A writing subagent starts in its own worktree and the call returns at once.
Either way, an answer that arrives later is part of the parent's next turn
under **Subagent results**, once, and whole. Stave keeps up to 4,000
characters of an answer; a longer one arrives as that beginning with a
reference to read the full turn. An answer that does not fit the turn arrives
whole in the next one, oldest first, and the oldest goes even when it alone is
larger than the turn's share. If several turns of one subagent end before the
parent's next turn, each answer arrives. An answer counts as received once the
provider accepts a parent turn that carried it, even if that turn is then
stopped. A host turn still waiting for a turn slot when the app quits is saved
with the answers it carries and records exactly those when it runs after the
restart. If Stave cannot record that a turn carried an answer, the next turn
carries it again; after three failed records in a row it stops resending that
answer and tells you once on the task, and the answer stays readable in the
Subagents tab. A child attached to the message still brings its new answers under
**Subagent results**, because the attachment is read separately and may be
empty. A composer review is addressed to the user: until the user attaches
it, Subagent results count it without its answer, and it arrives whole in the
message it is attached to.

## Interface Walkthrough

### Entry Points

The composer's **Request AI review** button starts a read-only, one-turn delegation in the
same workspace; see [Review Tasks](review-tasks.md). The task and Fleet
collaboration panels use the same coordinator as these Local MCP tools:

- `stave_delegate_task` — create (or re-report) a delegated task.
- `stave_list_delegated_tasks` — list what this task delegated.
- `stave_stop_delegated_task` — stop one delegation.
- `stave_follow_up_delegated_task` — request more work on a waiting, ongoing child,
  using the exact identity returned by the latest listing.

Inside a Stave turn these tools take the calling task from the host's caller
grant: the parent ids are optional, and a `parentTaskId` that names another task
is refused with `invalid-ownership`. A subagent cannot start subagents of its
own: a turn a delegation started, or any turn of the agent run it supervises,
is refused with `invalid-request`. The task a delegation created is still an
ordinary task, so a turn or agent run you start in it yourself (for example
`$ship` with a review stage) may delegate within its own run's limits. A client
Stave did not start (a terminal CLI with your token) names the parent
explicitly.

The Subagents list shows each subagent's agent (or model), what it is doing,
its state and how long it ran (still counting while it runs; a finished one also
says when it ended, with the exact time on hover), folds its answer under the
row, and offers **View progress** (the [Agent panel](#the-agent-panel),
for delegated tasks and in-turn subagents alike), Open transcript and Stop.

Each state has one mark and one word, the same in the Subagents list, the
Agents block in Turn Activity and the agent tree:

| State | Mark | Means |
| --- | --- | --- |
| **Needs you** (확인 필요) | Hand | It asked a question or an approval, or its run waits for a person. It goes nowhere until someone answers. |
| **Waiting** (대기 중) | Clock | It sits between turns on its own (an outside event, a usage reset) and carries on without you. |
| **Running** / **Queued** | Moving ring / dashed circle | It is working, or about to start. |
| **Returned** | Check | It finished and sent its answer back. |
| **Failed** / **Timed out** | Cross | It ended without an answer. |
| **Cancelled** | Square | It was stopped. |
| **Unresolved** | Question circle | Its turn ended without saying how this subagent ended. |

A child that waits on you comes first: one that asks a question or an
approval, then a delegated task that failed (only you can open and retry it).
Running subagents follow, then finished ones, newest first.

Above the list, the counts are filters: **All 6 · Needs you 2 · Failed 2 ·
Running 1 · Done 1**. Select one to show only those subagents; select it again
(or **All**) to show every one. Every subagent sits under exactly one filter, so
a failed delegated task is counted under **Failed**, not under **Needs you**.
When every subagent is in the same state the line is a sentence instead
(`3 running`). The tab itself still reads `1 · 3 need you`, counting the open
asks and the failed delegated tasks you can retry.

**Retry failed (N)** appears when delegated tasks failed and can be retried. It
asks once for retry instructions and retries each of those tasks in turn, each
with its original model and permissions; a refusal shows on that task's row.
An in-turn subagent that failed is reported and retried by the turn that called
it, so it is never part of this retry. A managed task's subagents stay
read-only. **Open {name}** opens the first child that waits on you in one click.

**Shared files** appears under that line when two or more of the task's
children write in worktrees of their own (a writer gets a new worktree by
default; a child working in the parent's workspace is not compared). It lists
every file that two or more of those worktrees changed since they left the
default branch, committed or not, with a column per worktree naming its
children and their state. A changed cell says how the file changed and opens
that worktree's diff of the file, read-only, in the editor. The list is read
when the tab opens and with its refresh button, never in the background; the
merge-base is reused while a worktree's HEAD stays, and the file list is read
again each time. A worktree Stave cannot find or read is named and left out.
It compares files only: whether the same lines changed is not checked, and a
child created from another branch than the default one counts that branch's
earlier changes too.
Turn Activity retains its compact child rows with follow-up, retry and release
controls. Settings → Providers → Delegated tasks documents provider availability,
per-call parameters and how many helper Agents one Agent run can call ([team limits](./agents.md#team-limits)).

A child does not appear as a peer in workspace task lists, counts, or Fleet
roll-ups — it is shown under its parent instead, so one delegated unit of work is
never counted twice.

### The Agent Panel

**View progress** on a subagent opens it in the **Agent** panel of the right
rail, beside the conversation, so following it never leaves the task. The same
panel opens from the Subagents tab (delegated tasks and in-turn subagents), an
agent row in Turn Activity or its agent tree, **View progress** on a subagent
card in the conversation, and **View** on a composer review. You can also open the panel from a Fleet subagent, a comparison candidate with a task, or a Tars work card with a linked Agent run.

- The header says where the agent came from (**Sub-agent of <task>**, which
  brings that task forward and shows the call that started it), its name and
  state, and one fact row in a fixed order: kind, model, effort, elapsed time
  (it stops when the agent ends), steps, and context or spend. Unknown facts are
  left out. While it runs, **Now** names the step it is on. **Stop** and
  **Open task** appear where the agent offers them; an in-turn subagent is
  watched, not stopped.
- The body leads with what the agent was asked, then its steps in the order
  they started, then its answer. A tool call reads as a sentence
  (`Reading src/main.tsx`, then `Read src/main.tsx`) with no tool
  names or JSON; MCP tools read as their own name without the server prefix.
  Consecutive calls and thoughts fold into one quiet block, and a running or
  failed step always stays in view. Each row opens to its input and output,
  read when you open it and cut at 16,000 characters.
- Choose **Timeline** to compare measured intervals and see overlapping work. Select a step on the chart to read its details. Steps without enough timing information appear below the chart. **List** shows the messages, expandable tool rows and links to nested agents.
- **Outputs** previews files from the assigned Scratch directory or Scratch files cited in the result. **Background** shows recorded commands and available log tails. Both tabs appear only for matching resources. In-turn subagents need a launch receipt tied to their spawning call for a background command to appear.
- What the agent said and messages it received stand on their own lines. A
  subagent it started opens in the same panel; **Back to <agent>** returns.
- The panel follows new steps while you are at the bottom. Scroll up and it
  stays put, with a **N new steps** button to jump back down.
- An in-turn subagent's steps come from its provider's saved transcript (Claude
  and Codex) when it can be read, refreshed every few seconds while it runs,
  and otherwise from the calls the parent turn recorded. A delegated task or a
  review reads its own conversation.

The Agent toggle appears in the rail only while an agent is selected. Closing
the panel (×) returns to the panel that was open before.

### Key Controls

Each child row carries the controls the delegation's current phase actually
allows:

| Control | Available when |
| --- | --- |
| Open | Always. Navigates to the delegated task, across workspaces if needed. |
| Follow-up | The delegation is `detached` and waiting, or `supervised` and its Run stopped for a person. Sends one more turn; a supervised child continues its waiting stage. |
| Stop | The child is still active. Ends the child's work. |
| Detach | A one-turn or detached child is still active. Releases the parent's claim and leaves the child running as an ordinary task. Supervised Agent work retains its delegation authority. |
| Retry | The delegation ended without succeeding and has attempts left. Starts a new attempt on the same child. |

A follow-up and retry reuse the recorded child permission policy and requested
model/effort. Newly tightened settings and saved-agent restrictions still apply.
An explicit profile may narrow that policy; it never grants more authority.
Missing permission fields use guarded defaults. If a newly restrictive Claude
mode cannot be combined with the saved mode without adding automatic approvals,
the attempt is refused rather than changing the permission boundary.

Ordinary managed `stave_run_task` calls also fill omitted permission fields from
the target provider's user settings. Its explicit runtime options retain the
existing override contract, including trusted agent run consent; that raw runtime
API is distinct from a delegation's `access`, which can only keep or narrow the
inherited policy.

Every control is prepared against the identity the row was rendered from (child
task, workspace, attempt, phase, turn) and is re-validated in the main process
before it lands. If the delegation moved on in between — a retry bumped the
attempt, the phase changed, the child's turn ended — the action is refused with a
`stale-identity` reason and a sentence explaining it, instead of applying to
whatever replaced it.

`stave_delegate_task` needs only a `prompt` inside a Stave turn. Everything else
is optional:

| Field | Meaning |
| --- | --- |
| `access` | `inherit` (default) uses the effective same-provider parent policy, or the target provider's user settings when crossing providers. `read-only` is the [read-only posture](#read-only-consults). Bound secrets, sessions and browser authorization are never inherited. |
| `provider` | `claude-code` or `codex`. Defaults, in order, to the named agent's Fixed provider, its preferred provider (`The other provider` is the one the parent is not on), the [Provider switching](auto-routing.md#provider-switching) strength-table choice for the agent's task class when that table is on, then the parent task's provider; a parent on another provider must name one. A preferred or strength provider whose CLI Stave cannot find falls back to the parent's provider; a provider that is installed but not signed in still fails on its own. A `provider` that contradicts a Fixed agent is refused rather than silently running the agent without its model. |
| `lifecycle` | A saved Agent (`agentConfigId`) defaults to `supervised`: its existing Run continues to accepted completion, bounded by time and provider usage rather than a turn count. Model-only work defaults to `one-turn`. Explicit `one-turn` ends after the first turn; `detached` stays open for parent follow-ups until stopped. |
| `workspace` | `new-worktree` (default for a writer) with a name and optional base branch, or `same-workspace` (default for a read-only subagent or work pinned with `expectedHead`). A writer in the same workspace is refused while another writing subagent is live there. |
| `wait` | `true` waits up to 120 seconds for the answer and returns it as `child.result`; a number waits that many seconds (max 180); `false` returns at once. Defaults to `true` for read-only and `false` otherwise. The subagent keeps running when the wait ends. |
| `delegationKey` | Idempotency key, unique within the parent task. The same key always names the same child. Omitted, it is derived from the parent task, the resolved provider, model, prompt and agent, so sending the same call again returns the same child. |
| `retry` | Start a new attempt on a delegation that already ended without succeeding. |
| `usageOverride` | `user-request`, only when you asked for this provider or model. It starts the subagent even where the account usage check below would refuse it. |

`permissionProfile` is no longer offered to agents. A call from an older client
that still sends it is accepted: `inherit` and `auto` mean `inherit`, and
`guided` or `manual` are recorded on the child's policy for provenance but no
longer applied, because they made every tool call in the child ask for
approval.

### Read-Only Consults

`access: "read-only"` asks for a child that cannot change files and never asks
for approval. Stave resolves it per provider:

- **Codex:** `read-only` file access, approval `never`, network off, and Stave
  Local MCP auto-approval off. The Stave tools that read Stave state or record
  the work in it are pre-approved per tool, because Codex otherwise rejects a
  non-read-only MCP call outright under approval `never`.
- **Claude:** `dontAsk` with an allowlist of reads — `Read`, `Grep`, `Glob`,
  `LS`, `NotebookRead`, `WebFetch`, `WebSearch`, read-only Git commands
  (`git status`, `diff`, `log`, `show`, `blame`, `rev-parse`, `ls-files`,
  `grep`), Stave tools that only read Stave state, and Stave tools that record
  the work without touching the repository: adding notes, todos, links and
  custom fields, `stave_write_plan_file` (only `.stave/context/plans/<name>.md`)
  and the stage report tools. Everything else is denied without a prompt. The
  edit tools, `AskUserQuestion` and every Stave tool that clears or removes
  workspace information, edits memory or schedules, starts or answers a task,
  or drives the browser are removed outright, and Bash runs in a sandbox that
  denies filesystem writes and fails closed where no sandbox is available.

The posture never exceeds the policy the child would otherwise inherit: denied
tools and sandbox credential deny lists carry over, and the parent's mode,
approvals and allowlist cannot add to it. Profile and agent ceilings are not
applied on top, because a posture that cannot write and auto-runs only reads
is already within every one of them; a `dontAsk` parent can delegate
read-only without the combination being refused. The resolved `access` is
recorded on the child's policy, and once a child is read-only its follow-ups
and retries stay read-only.

Limits:

- Allow rules that Claude settings files already grant still apply to tools
  outside this list, such as another MCP server's tools. A Bash rule there
  still runs inside the write-denying sandbox.
- Codex has no per-tool filter for Stave Local MCP, so a read-only Codex child
  can still use the Stave tools that are always allowed (workspace notes,
  todos, memory and automation definitions). None of them touch files.


### Run As An Agent

A saved Agent defaults to supervised completion. If it pauses for guidance,
its parent is asked first: a parent waiting on delegated work wakes once for
that stall and may answer with `stave_follow_up_delegated_task`, stop it or do
the work itself. You can also open the child task and use **Reply to the delegated Agent** in its Run area;
the reply continues the same stage with the admitted permissions and turn
limit. A paused Run must be resumed first. **Take Over** cancels delegated
supervision and gives you direct task control. To supervise that work again,
start a new delegation; a retry cannot reclaim the task silently.

A delegation may name a saved agent (`agentConfigId`). The agent's
instructions go ahead of the prompt and the agent's permission is a ceiling on
what the child inherits; a read-only request stays read-only. It is refused, with the reason, when
the agent is not usable as a delegated task or would run with more
permission than the delegating task's own agent. A retry runs as the same agent.

`expectedHead` pins same-workspace work to a commit: the child does not start
when the workspace HEAD differs, and a retry keeps the pin. The commit is
checked after workspace admission, immediately before the child starts.

### Model And Effort

Two optional runtime choices ride along: `model` overrides the child's model, and
`effort` picks its reasoning tier (`low`–`max`, plus Codex's `ultra`). An effort
the child's provider or model does not accept steps down to the nearest tier
below it rather than being rejected. An
omitted effort follows the parent turn's effort when the child runs on the same
provider, and otherwise keeps the automation default (`medium`). Bounded briefs
often do better on a cheaper model at `high`+ effort than on a bigger model at
the default tier. Both are recorded on the claim receipt, so a retry reuses
them, including an inherited effort.

Neither has a global default in Settings, and that is deliberate rather than
missing: what a delegation leaves out follows the delegating task, which the
agent can see, rather than a hidden setting the receipt could not prove. Steer
them in the request — "ask a Codex child at `high` effort" — and read the
result back in the Delegation card or the delegated task row.

## Common Workflows

### Delegate Something

1. Call `stave_delegate_task` with the prompt, and `access: "read-only"` for a
   consult. Name a provider, lifecycle or workspace only when the parent's
   defaults are not what you want.
2. Optionally choose a `delegationKey` that describes the work (`docs-review`,
   `migrate-tests`).
3. Calling it again with the same inputs returns the same child instead of
   creating a second one. Calling it with the same key but a different prompt is
   refused (`input-mismatch`) rather than silently ignored.

### Check On A Child

Read the child rows in the parent's turn activity. Each row shows the child's
provider, lifecycle, phase, attempt and terminal reason, and refreshes when the
delegation changes phase — including phase changes driven by the child's own
turns, which are pushed rather than polled.

The agent can call `stave_list_delegated_tasks` for the same summary. It is also
injected into the parent's context automatically before each of its turns as
**Subagent results**, with the answers that are new to the parent.

### Answer A Child's Question

When a question includes option previews, the preview space stays reserved as
focus or the pointer moves between choices, including choices without a preview.
Only the current preview is visible and keyboard-accessible. The question and
its choices stay in place in both the task composer and the delegated request slot.

A child that needs an approval or an answer raises an interaction request that
stays the child's: it is answered against the child's own task, turn and
request. Stave publishes it once, attributed to the root of the delegation
chain (the task that started the first delegation), so it reaches the person
working there. It appears in these places:

- **The root task's composer.** The approval slot above the prompt, where the
  task's own approvals appear, shows the oldest open request from any
  delegated descendant. A task between the root and the child shows it too.
  It names the delegated task and the provider and model that asked, and
  offers the usual `Allow once` / `Deny` or answer controls.
  Answering there responds to the child without selecting it or switching
  workspaces, including for a child running in its own worktree. Further
  requests wait behind it as `+N more`. **Continue** and **Decline to answer**
  close the question once the child accepts the response. If delivery fails
  while the question is still pending, the card shows the reason and lets you
  retry. A request the child already answered,
  or one that expired, reads "This request was answered or expired." and
  offers a close (×) button; closing it resolves its notification, so it stays
  gone after a restart and the next request takes its place. The button only
  appears once Stave has loaded the child's message and confirmed the request
  is no longer pending. A request still waiting, one that could not be loaded,
  or an asynchronous question that outlived its turn and can still be answered
  has no close button.
  A child takes messages only from its delegation, so an answer to its
  asynchronous question is sent as a follow-up of that delegation. When the
  delegation has ended or no longer accepts follow-ups, **Decline to answer**
  closes the question, and **Continue** reads "This question can no longer be
  answered" and offers the close button. While the child is still working, the
  card asks you to answer again after it stops.
  An approval that the child no longer has waiting (its turn ended, or it was
  answered elsewhere) closes when you answer it instead of failing again.
- **Notifications.** The item reads as the root task, with the delegated task
  named in its detail. Opening it focuses the root task rather than the
  child's workspace.
- **Fleet.** Fleet keeps the request on the delegated task.

A request answered in any of these places, in the child itself, by the agent
through `stave_respond_approval`, or auto-denied, disappears from all of them.
The response is only sent while the child still shows the same request in the
same turn; anything else reads as answered or expired.

This matters because nothing outside Stave is watching a child: the person who
owns the parent is the only one who can answer, and an unanswered approval
auto-denies after a few minutes. A task driven by a real external controller,
with no delegating parent, still publishes no notification for its requests.

### Stop, Detach, Or Retry A Child

Use the child row's controls, or have the agent call `stave_stop_delegated_task`.

Stopping cancels the ledger row durably and asks the delegated task to stop as a best
effort, because a child that already ended is a successful stop. Detaching is the
narrower action: it ends only the parent's claim, leaving the child alive as an
ordinary task nobody is delegating to — including in the task listings: detach
clears the delegation stamp on the child's task row, so the child reappears in
ordinary workspace listings instead of staying hidden behind its former parent
forever. Retrying starts a fresh attempt on the
same child, reading provider, lifecycle, workspace, model, effort, access and
permission profile back from the delegation so a retry cannot quietly become a different delegation
reusing the key. Only the prompt is expected to change — a retry may carry new
instructions without tripping the `input-mismatch` guard, which continues to
refuse a *non-retry* delegate under the same key with different inputs.

## Files And Data

Delegations live in the run ledger inside Stave's SQLite database, as a
`delegated-task` run with a `task` origin and one `delegated-task-turn` step:

```json
{
  "runId": "child-task:parent-task-1:docs-review",
  "delegatedTaskId": "6f1c2f1e-1b6b-4d2e-9d21-6f5a0d2c4b77",
  "delegatedWorkspaceId": "workspace-docs-review",
  "providerId": "codex",
  "lifecycle": "one-turn",
  "phase": "completed",
  "reason": null
}
```

Each answer is a result receipt on the child's run. When the provider accepts
the prompt of a parent turn that carries an answer (Claude's input queue takes
it, Codex acknowledges `turn/start`, an ACP prompt returns), a delivery record
naming the parent turn is written beside the run ledger
(`electron/persistence/delegated-answer-store.ts`), so later turns skip it after
a restart too. A turn refused or failed before that point (a control change, a
cancelled queue slot, a policy refusal, no workspace folder, a provider that
cannot start, a native slash command, which goes without context) records
nothing, and a failed write is logged and leaves the answer owed, so it can
come twice but is never lost. A request too large for the host transport keeps
the Subagent results part whole or drops it with the answers it names, which
then stay owed. Upgrade cut: on
the first read for a parent, answers recorded before this version first opened
the database and no later than the parent's latest turn start count as
received, because the earlier version had already given them or dropped them
for its budget; it runs once per parent and never touches answers recorded
after the upgrade. The run ledger itself is unchanged, so earlier versions still
read the database.

Set `STAVE_DELEGATED_TASK_CONCURRENCY` to change how many children one parent task
may have running at once (default 3, maximum 16).

## Limitations And Advanced Options

- A parent never receives the child's transcript. Receipts carry identity, phase,
  terminal reason and the child's final answer, bounded to 4,000 characters;
  open the delegated task to read the conversation.
- A cancelled delegation is not restarted by `retry`. Use a new delegation key.
- Watching and steering a child is available in the UI, but *creating* one is
  not: a subagent is always started by an agent rather than by a button.
- Detaching is one-way. A released delegation cannot be re-claimed; the child
  continues as an ordinary task.
- A `new-worktree` child's workspace is cleaned up automatically only when it
  is safe (see [Child workspaces](#child-workspaces)); otherwise it stays and
  is listed in **Clean up workspaces** with the reason. There is no setting for
  this: the rules below only ever archive, and archiving keeps the branch.

## Child workspaces

A `new-worktree` child gets a workspace of its own. In the sidebar's
Repositories view it is nested under the workspace that delegated it,
indented by one AUI space step per level (a grandchild under its own parent;
deeper rows keep their place but stop indenting after two levels). The parent
row shows how many workspaces are nested under it and toggles them; collapse
is kept for the session, like a repository's. The collapsed rail and the
Cmd/Ctrl+Shift+1–9 shortcuts follow the same order and skip hidden rows. Only
top-level rows reorder; a nested row follows its parent. A nested row's status
mark shows the delegation's phase (queued, working, waiting, done, failed,
stopped) when no attention item or running turn says more. The Work queue view
stays ranked by status and does not nest.

The relationship is read from rows that already exist, so it survives a
restart without new storage: the delegation's run (`runs.kind =
'delegated-task'`) owns the child workspace and task and names the parent task
as its origin, and the parent task's row names the parent workspace
(`electron/persistence/delegated-workspace-links.ts`). A detached delegation, a
same-workspace delegation, and an archived or deleted parent or child produce
no link, so those workspaces are ordinary top-level rows.

Archiving a workspace with nested workspaces lists them in the confirmation
with **Also archive N subagent workspaces** (on by default). They are archived
first, deepest first, through the same archive action and checks; the first
one refused stops before the parent and is named in the dialog.

Stave archives a child workspace automatically, through the ordinary archive
action, only when all of these hold:

1. The delegation is final: `completed`, or `cancelled` by the parent. A
   `failed` or `interrupted` delegation can be retried in the same workspace,
   and a pending, running or waiting one is still working.
2. Every answer the child produced has been carried by a parent turn.
3. No other delegated workspace is nested under it.
4. Its worktree has no uncommitted or untracked files that Git does not
   ignore, no tracked file Git hides from status (`assume-unchanged` or
   `skip-worktree`) with an edit, and no unfinished merge, rebase, cherry-pick,
   revert or bisect.
5. Its HEAD and branch have no commit unreachable from both the parent
   workspace's HEAD and the default branch. This replaces the ordinary
   automatic archive's unpushed-commit check, since those commits are kept by
   the parent's branch or the default branch.
6. The archive's other blockers allow it (current workspace, running turn,
   open terminal, pending attention, ownership and the rest).
7. The user did not restore it from **Clean up workspaces** since it was last
   archived. A restored child stays until the user archives it again.

The rules are checked again inside the archive while the workspace's execution
is stopped. A sweep runs after a parent turn carries answers, after a
delegation changes phase, 30 seconds after start and every ten minutes. A
workspace that fails a rule is never removed automatically: **Clean up
workspaces** shows it as "Subagent workspace of <parent>" with what kept it.
Branches are never deleted; restore an automatic archive from **Recent
cleanup**.

The optional inactivity, maximum and merged-PR cleanup policies also leave a
child the delegation still holds: one still working, one that can be retried,
one with an answer no parent turn carried yet, one with workspaces nested
under it, and one the user restored. A child stays held after its parent
workspace is archived, so archiving the parent first in the same cleanup does
not release it. That check runs again inside the archive.

## Troubleshooting

### The delegation was refused with `workspace-writer-busy`

- Cause: the call asked for a writing subagent in the same workspace while
  another writing subagent is live there. The refusal names that subagent.
- Fix: omit `workspace` so the writer gets its own worktree, or wait for the
  other one to finish. Read-only subagents (a resolved Codex `read-only` file
  access, or the full Claude read-only posture) never count as writers.
  Permission profile names do not establish read-only tool access.

### The delegation was refused with `usage-limited`

- Symptom: `stave_delegate_task` returns `accepted: false`,
  `reason: "usage-limited"`, and the message names both providers' usage.
- Cause: before a model's new subagent (or a retry) starts, Stave checks the
  account usage it already holds for the calling turn's accounts (see
  [Team limits](agents.md#team-limits)). It refuses the start when the target
  provider's account is exhausted, when the requested model's own window is
  used up, or when the provider is critical (85% or more of its tightest
  window) while the other provider is below that. Re-sending a running child's
  key, follow-ups, the composer's Review and workflow stages are not checked,
  and usage Stave has not read recently never refuses.
- Fix: start the subagent on the other provider or another model, wait for the
  reset the message names, or pass `usageOverride: "user-request"` when you
  asked for that provider.

### The delegation was refused with `invalid-ownership`

- Symptom: `stave_delegate_task` returns `accepted: false`,
  `reason: "invalid-ownership"`.
- Cause: inside a Stave turn, the call named a parent task or workspace that is
  not the calling task's. Outside one, the parent task id, the parent workspace
  id, and the repository path do not describe the same place.
- Fix: inside a turn, omit the ids. Outside one, read them from the task's
  context block rather than assembling them by hand.

### The delegation was refused with `concurrency-limit-reached`

- Symptom: a new delegation is rejected while earlier ones still run.
- Cause: the parent already has the maximum number of live children.
- Fix: stop a child, wait for one to finish, or raise
  `STAVE_DELEGATED_TASK_CONCURRENCY`.

### A control was refused with `stale-identity`

- Symptom: Stop, Retry, Follow-up or Detach reports that the delegation moved on.
- Cause: the row the control was prepared from no longer describes the
  delegation — the attempt was bumped, the phase changed, or the child's turn
  ended between rendering and clicking.
- Fix: none needed; the refusal is the safe outcome. The rows refresh on their
  own, so act on the updated row.

### A child's approval was auto-denied before it was noticed

- Symptom: a delegated task reports a denied action nobody answered.
- Cause: child interaction requests expire like any other; an unanswered
  approval auto-denies after a few minutes.
- Fix: answer from the root task's composer, where child requests appear while
  they are open. Use the provider's user permissions for work that should run
  unattended, or `access: "read-only"` for a consult, which never asks.

### A child shows `interrupted` after a restart

- Symptom: a delegation that was running before a restart now reads
  `interrupted`.
- Cause: on restart Stave compares each delegation against its live delegated task.
  The child had no active turn and no completed turn to attribute the run to.
- Fix: re-send the delegation with `retry: true` to start a new attempt on the
  same delegated task.

## Related Docs

- [`docs/architecture/agent-platform-taxonomy.md`](../architecture/agent-platform-taxonomy.md)
- [`docs/architecture/run-core.md`](../architecture/run-core.md)
- [`docs/features/local-mcp-user-guide.md`](local-mcp-user-guide.md)
- [`docs/features/automations.md`](automations.md)
- [`docs/features/provider-sandbox-and-approval.md`](provider-sandbox-and-approval.md)

While answering a pending question, incoming turn events preserve the draft text
and selected options. A different request starts with its own answers.
