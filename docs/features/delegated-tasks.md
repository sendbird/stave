# Delegated Tasks

## Summary

A task can hand work to a **subagent**. The durable kind is a **delegated
task**: a real Stave task created on its behalf, optionally on the other
provider and in its own worktree. The delegation is recorded on the run ledger,
so the parent can trust what it is told about the child — including after a
restart — and the child's answer comes back to the parent on its own.

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
never survive a restart. Prefer an **automation** when the work should recur on
a schedule rather than be handed off once.

## Before You Start

- The **Subagents** tab of the right rail's Task panel lists every subagent the
  task called, durable or in-turn. Delegation requires the Stave Local MCP
  server (Settings → Local MCP).
- The parent task's workspace must belong to a registered repository. A delegation
  is refused when the parent task, its workspace, and the repository path do not
  agree.

## Quick Start

Ask the agent in the parent task to delegate, for example:

> Get a read-only second opinion on this plan from Codex.

The agent calls `stave_delegate_task`. A read-only call waits for the answer
(up to two minutes by default, three at most) and returns it as `child.result`.
A writing subagent starts in its own worktree and the call returns at once.
Either way, an answer that arrives later is part of the parent's next turn
under **Subagent results**, so the agent never has to read the child task to
collect it.

## Interface Walkthrough

### Entry Points

The task and Fleet collaboration panels use the same coordinator as these
Local MCP tools:

- `stave_delegate_task` — create (or re-report) a delegated task.
- `stave_list_delegated_tasks` — list what this task delegated.
- `stave_stop_delegated_task` — stop one delegation.
- `stave_follow_up_delegated_task` — request more work on a waiting, ongoing child,
  using the exact identity returned by the latest listing.

Inside a Stave turn these tools take the calling task from the host's caller
grant: the parent ids are optional, and a `parentTaskId` that names another task
is refused with `invalid-ownership`. A subagent cannot start subagents of its
own. A client Stave did not start (a terminal CLI with your token) names the
parent explicitly.

The Subagents tab shows each subagent's agent (or model), what it is doing and
its state, folds its answer under the row, and offers Open transcript and Stop.
Turn Activity retains its compact child rows with follow-up, retry and release
controls. Settings → Providers → Delegation documents provider availability and
per-call parameters.

A child does not appear as a peer in workspace task lists, counts, or Fleet
roll-ups — it is shown under its parent instead, so one delegated unit of work is
never counted twice.

### Key Controls

Each child row carries the controls the delegation's current phase actually
allows:

| Control | Available when |
| --- | --- |
| Open | Always. Navigates to the delegated task, across workspaces if needed. |
| Follow-up | The delegation is `detached` and waiting. Sends one more turn. |
| Stop | The child is still active. Ends the child's work. |
| Detach | The child is still active. Releases the parent's claim and leaves the child running as an ordinary task. |
| Retry | The delegation ended without succeeding and has attempts left. Starts a new attempt on the same child. |

A follow-up and retry reuse the recorded child permission policy and requested
model/effort. Newly tightened settings and saved-agent restrictions still apply.
An explicit profile may narrow that policy; it never grants more authority.
Missing permission fields use guarded defaults. If a newly restrictive Claude
mode cannot be combined with the saved mode without adding automatic approvals,
the attempt is refused rather than changing the permission boundary.

Ordinary managed `stave_run_task` calls also fill omitted permission fields from
the target provider's user settings. Its explicit runtime options retain the
existing override contract, including trusted Mission consent; that raw runtime
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
| `provider` | `claude-code` or `codex`. Defaults to the parent task's provider; a parent on another provider must name one. |
| `lifecycle` | `one-turn` (default) finishes the delegation when the child's first turn ends. `detached` keeps the child open until it is stopped. |
| `workspace` | `new-worktree` (default for a writer) with a name and optional base branch, or `same-workspace` (default for a read-only subagent or work pinned with `expectedHead`). A writer in the same workspace is refused while another writing subagent is live there. |
| `wait` | `true` waits up to 120 seconds for the answer and returns it as `child.result`; a number waits that many seconds (max 180); `false` returns at once. Defaults to `true` for read-only and `false` otherwise. The subagent keeps running when the wait ends. |
| `delegationKey` | Idempotency key, unique within the parent task. The same key always names the same child. Omitted, it is derived from the parent task, provider, model and prompt, so sending the same call again returns the same child. |
| `retry` | Start a new attempt on a delegation that already ended without succeeding. |

`permissionProfile` is no longer offered to agents. A call from an older client
that still sends it is accepted: `inherit` and `auto` mean `inherit`, and
`guided` or `manual` are recorded on the child's policy for provenance but no
longer applied, because they made every tool call in the child ask for
approval.

### Read-Only Consults

`access: "read-only"` asks for a child that cannot change files and never asks
for approval. Stave resolves it per provider:

- **Codex:** `read-only` file access, approval `never`, network off, and Stave
  Local MCP auto-approval off.
- **Claude:** `dontAsk` with an allowlist of reads — `Read`, `Grep`, `Glob`,
  `LS`, `NotebookRead`, `WebFetch`, `WebSearch`, read-only Git commands
  (`git status`, `diff`, `log`, `show`, `blame`, `rev-parse`, `ls-files`,
  `grep`) and Stave tools that only read Stave state. Everything else is denied
  without a prompt. The edit tools, `AskUserQuestion` and every Stave tool that
  edits workspace information, memory or schedules, starts or answers a task,
  or drives the browser are removed outright, and Bash runs in a sandbox that
  denies filesystem writes and fails closed where no sandbox is available.

The posture never exceeds the policy the child would otherwise inherit: denied
tools and sandbox credential deny lists carry over, and the parent's mode,
approvals and allowlist cannot add to it. Profile and agent ceilings are not
applied on top, because a posture that cannot write and auto-runs only reads
is already within every one of them; a `plan` or `dontAsk` parent can delegate
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

A delegation may name a saved agent (`agentConfigId`). The agent's
instructions go ahead of the prompt and the agent's permission is a ceiling on
what the child inherits; a read-only request stays read-only. It is refused, with the reason, when
the agent is not usable as a delegated task, is not one of the project's
agents, or would run with more permission than the delegating task's own
agent. A retry runs as the same agent.

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
**Subagent results**, with the bounded answer of every subagent that finished
since the previous turn, so an agent that delegated work never asks for it.

### Answer A Child's Question

A child that needs an approval or an answer raises an interaction request that
stays the child's: it is answered against the child's own task, turn and
request. Stave publishes it once, attributed to the root of the delegation
chain (the task that started the first delegation), so it reaches the person
working there. It appears in these places:

- **The root task's composer.** The approval slot above the prompt, where the
  task's own approvals appear, shows the oldest open request from any
  delegated descendant. A task between the root and the child shows it too.
  It names the delegated task and the provider and model that asked, and
  offers the usual Approve/Reject or answer controls.
  Answering there responds to the child without selecting it or switching
  workspaces, including for a child running in its own worktree. Further
  requests wait behind it as `+N more`.
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
- Creating a `new-worktree` child leaves the worktree in place when the child
  ends. Remove it through the normal workspace controls.

## Troubleshooting

### The delegation was refused with `workspace-writer-busy`

- Cause: the call asked for a writing subagent in the same workspace while
  another writing subagent is live there. The refusal names that subagent.
- Fix: omit `workspace` so the writer gets its own worktree, or wait for the
  other one to finish. Read-only subagents (a resolved Codex `read-only` file
  access, or the full Claude read-only posture) never count as writers.
  Permission profile names and Claude plan mode do not establish read-only
  tool access.

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
