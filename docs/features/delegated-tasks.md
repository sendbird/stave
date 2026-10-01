# Delegated Tasks

## Summary

A task can hand work to a **delegated task**: a real, durable Stave task created
on its behalf, optionally on the other provider and in its own worktree. The
delegation is recorded on the run ledger, so the parent can trust what it is
told about the child — including after a restart.

## When To Use It

- For a task that should keep running on its own schedule while the parent moves
  on, and that must survive quitting and reopening Stave.
- For handing a piece of work to the other provider (a Claude task delegating to
  a Codex child, or the reverse).
- For work that should be isolated in its own worktree instead of sharing the
  parent's checkout.

Prefer **Worker mode** when the delegated work only needs to last for the
current turn: a worker is turn-scoped and never survives a restart. Prefer an
**automation** when the work should recur on a schedule rather than be handed off
once.

## Before You Start

- Use **Collaboration & workflows → Team** in a task or Fleet control panel,
  or the **Team** tab in the right rail, which lists the task's Advisor
  consults, workers and delegated tasks.
  Agent-driven delegation additionally requires the Stave Local MCP server
  (Settings → Local MCP).
- The parent task's workspace must belong to a registered repository. A delegation
  is refused when the parent task, its workspace, and the repository path do not
  agree.

## Quick Start

Open **Collaboration & workflows → Team → Delegate a task to another model**.
Specify the assignment, provider, optional model, permissions, and file isolation.
The default uses guided permissions and a separate Git worktree, and keeps the
child available for follow-up. Uncheck that option for a single-turn assignment.
Release the child when the assignment is finished.

Alternatively, ask the agent in the parent task to delegate, for example:

> Delegate the docs review to a Codex child in a new worktree, guided
> permissions, one turn, delegation key `docs-review`.

The agent calls `stave_delegate_task`. The child appears as a normal task in its
workspace, and the parent gets back the child's identity and phase.

## Interface Walkthrough

### Entry Points

The task and Fleet collaboration panels use the same coordinator as these
Local MCP tools:

- `stave_delegate_task` — create (or re-report) a delegated task.
- `stave_list_delegated_tasks` — list what this task delegated.
- `stave_stop_delegated_task` — stop one delegation.
- `stave_follow_up_delegated_task` — request more work on a waiting, ongoing child,
  using the exact identity returned by the latest listing.
- `stave_get_task` — collect the latest assistant answer and pending requests.

The collaboration panel provides creation, conversation navigation, follow-up,
stop, retry, and release controls. Turn Activity retains its compact child rows.
Settings → Providers → Delegation documents provider availability and per-call
parameters. The UI's delivery retry keeps the same delegation identity when a
transport response is lost, so retrying does not create a second child.

The Workflows & tools tab separates goals (workflows), reusable instructions
(macros), runtime launch settings (presets), and workspace commands/services.
Adding instructions preserves the current draft and never sends it automatically.

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
API is distinct from a delegated `permissionProfile`, which is always a ceiling.

Every control is prepared against the identity the row was rendered from (child
task, workspace, attempt, phase, turn) and is re-validated in the main process
before it lands. If the delegation moved on in between — a retry bumped the
attempt, the phase changed, the child's turn ended — the action is refused with a
`stale-identity` reason and a sentence explaining it, instead of applying to
whatever replaced it.

`stave_delegate_task` requires the choices that must never be inherited:

| Field | Meaning |
| --- | --- |
| `delegationKey` | Caller-chosen idempotency key, unique within the parent task. The same key always names the same child. |
| `provider` | `claude-code` or `codex`. Required — never inherited from the parent. |
| `permissionProfile` | Optional: omit or use `inherit` for the effective same-provider parent policy, or the target provider's user settings when crossing providers. `guided`/`manual` are restrictions; `auto` cannot widen user authority. Bound secrets, sessions and browser authorization are never inherited. |
| `lifecycle` | `one-turn` finishes the delegation when the child's first turn ends. `detached` keeps the child open until it is stopped. |
| `workspace` | `same-workspace`, or `new-worktree` with a name and optional base branch. |
| `retry` | Start a new attempt on a delegation that already ended without succeeding. |

### Run As An Agent

A delegation may name a saved agent (`agentConfigId`). The agent's
instructions go ahead of the prompt and the narrower of the requested
permission profile and the agent's wins. It is refused, with the reason, when
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
below it rather than being rejected — the same clamp the Advisor uses — and an
omitted effort keeps the automation default (`medium`). Bounded briefs often do
better on a cheaper model at `high`+ effort than on a bigger model at the
default tier. Both are recorded on the claim receipt, so a retry reuses them.

Neither has a global default in Settings, and that is deliberate rather than
missing: a child's provider, permissions and workspace must be declared by the
delegation that creates it, so an agent choosing a cheap child for a bounded
brief is making one decision the request can be read back from. A hidden default
would move part of that decision somewhere the delegating agent never sees, and
somewhere the receipt could not prove. Steer them in the request instead —
"delegate this to a Codex child at `high` effort" — and read the result back in
the Delegation card or the delegated task row.

## Common Workflows

### Delegate Something

1. Choose a `delegationKey` that describes the work (`docs-review`,
   `migrate-tests`).
2. Call `stave_delegate_task` with the provider, permission profile, lifecycle
   and workspace strategy.
3. Calling it again with the same key returns the same child instead of creating
   a second one. Calling it with the same key but a different prompt is refused
   (`input-mismatch`) rather than silently ignored.

### Check On A Child

Read the child rows in the parent's turn activity. Each row shows the child's
provider, lifecycle, phase, attempt and terminal reason, and refreshes when the
delegation changes phase — including phase changes driven by the child's own
turns, which are pushed rather than polled.

The agent can call `stave_list_delegated_tasks` for the same summary. It is also
injected into the parent's context automatically before each of its turns, so an
agent that delegated work sees where its children stand without asking.

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
- **Fleet and the Team panel.** Fleet keeps the request on the delegated task,
  and the Team panel lists it under the child's row.

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
same child, reading provider, lifecycle, workspace, model, effort and permission
profile
back from the delegation so a retry cannot quietly become a different delegation
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

- A parent never receives the child's transcript. Receipts carry identity, phase
  and terminal reason only; open the delegated task to read the conversation.
- A cancelled delegation is not restarted by `retry`. Use a new delegation key.
- Watching and steering a child is available in the UI, but *creating* one is
  not: delegation is driven by the MCP tools, so a child is always started by an
  agent rather than by a button.
- Detaching is one-way. A released delegation cannot be re-claimed; the child
  continues as an ordinary task.
- Creating a `new-worktree` child leaves the worktree in place when the child
  ends. Remove it through the normal workspace controls.

## Troubleshooting

### The delegation was refused with `workspace-writer-busy`

- Cause: another managed child has reserved the same physical workspace for
  writing. The refusal identifies the current child, parent and attempt.
- Fix: wait for that child's turn to end, or choose a separate worktree.
  Stop and Detach keep the reservation until the host confirms the running
  turn ended; an unavailable or unknown outcome remains guarded.
  A restart before the child's turn identity was recorded also remains guarded
  because Stave cannot safely identify a terminal turn to release it.
- Different worktrees may run in parallel. Children with resolved Codex
  read-only file access do not reserve a writer slot. Permission profile names
  and Claude plan mode do not establish read-only tool access.
- This coordinates managed child admission. It does not isolate files,
  constrain tool paths, or prevent ordinary direct tasks and parent turns from
  writing. Legacy active children without lease metadata are checked against
  their actual workspace and remain guarded when their outcome is unknown.

### The delegation was refused with `invalid-ownership`

- Symptom: `stave_delegate_task` returns `accepted: false`,
  `reason: "invalid-ownership"`.
- Cause: the parent task id, the parent workspace id, and the repository path do
  not describe the same place.
- Fix: read them from the current task's context block rather than assembling
  them by hand.

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
  unattended, and reserve `guided` for children being watched.

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
