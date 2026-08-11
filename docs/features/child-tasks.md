# Child Tasks

## Summary

A task can delegate work to a **child task**: a real, durable Stave task created
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
current turn: a worker is turn-scoped and never survives a restart. Prefer a
**Routine** when the work should recur on a schedule rather than be handed off
once.

## Before You Start

- The Stave Local MCP server must be running (Settings → Local MCP). Child tasks
  are driven entirely by MCP tools.
- The parent task's workspace must belong to a registered project. A delegation
  is refused when the parent task, its workspace, and the project path do not
  agree.

## Quick Start

Ask the agent in the parent task to delegate, for example:

> Delegate the docs review to a Codex child in a new worktree, guided
> permissions, one turn, delegation key `docs-review`.

The agent calls `stave_delegate_task`. The child appears as a normal task in its
workspace, and the parent gets back the child's identity and phase.

## Interface Walkthrough

### Entry Points

Three Local MCP tools, all called by the agent in the parent task:

- `stave_delegate_task` — create (or re-report) a child task.
- `stave_list_child_tasks` — list what this task delegated.
- `stave_stop_child_task` — stop one delegation.

Delegating is agent-driven, but watching and steering is not: once a turn has
delegated, the parent's conversation shows a **child task row** per delegation,
directly in the turn activity. The child is also a task in its own right, so it
opens as a normal task and carries a backlink to the parent it was delegated
from.

A child does not appear as a peer in workspace task lists, counts, or Fleet
roll-ups — it is shown under its parent instead, so one delegated unit of work is
never counted twice.

### Key Controls

Each child row carries the controls the delegation's current phase actually
allows:

| Control | Available when |
| --- | --- |
| Open | Always. Navigates to the child task, across workspaces if needed. |
| Follow-up | The delegation is `detached` and waiting. Sends one more turn. |
| Stop | The child is still active. Ends the child's work. |
| Detach | The child is still active. Releases the parent's claim and leaves the child running as an ordinary task. |
| Retry | The delegation ended without succeeding and has attempts left. Starts a new attempt on the same child. |

A follow-up chooses its own permission profile rather than inheriting the
parent's or the original delegation's — the same rule that applies when the child
is first created.

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
| `permissionProfile` | `auto` (unattended), `guided` (sensitive actions take the approval path), or `manual` (provider defaults). Required — never inherited, and the parent's bound secrets are never passed on. |
| `lifecycle` | `one-turn` finishes the delegation when the child's first turn ends. `detached` keeps the child open until it is stopped. |
| `workspace` | `same-workspace`, or `new-worktree` with a name and optional base branch. |
| `retry` | Start a new attempt on a delegation that already ended without succeeding. |

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

The agent can call `stave_list_child_tasks` for the same summary. It is also
injected into the parent's context automatically before each of its turns, so an
agent that delegated work sees where its children stand without asking.

### Answer A Child's Question

A child that needs an approval or an answer raises it as an ordinary interaction
request, attributed to the child task and routed to the workspace the child runs
in. It appears in Fleet and in the sidebar like any other request.

This matters because nothing outside Stave is watching a child: the person who
owns the parent is the only one who can answer, and an unanswered approval
auto-denies after a few minutes.

### Stop, Detach, Or Retry A Child

Use the child row's controls, or have the agent call `stave_stop_child_task`.

Stopping cancels the ledger row durably and asks the child task to stop as a best
effort, because a child that already ended is a successful stop. Detaching is the
narrower action: it ends only the parent's claim, leaving the child alive as an
ordinary task nobody is delegating to — including in the task listings: detach
clears the delegation stamp on the child's task row, so the child reappears in
ordinary workspace listings instead of staying hidden behind its former parent
forever. Retrying starts a fresh attempt on the
same child, reading provider, lifecycle, workspace, model and permission profile
back from the delegation so a retry cannot quietly become a different delegation
reusing the key. Only the prompt is expected to change — a retry may carry new
instructions without tripping the `input-mismatch` guard, which continues to
refuse a *non-retry* delegate under the same key with different inputs.

## Files And Data

Delegations live in the run ledger inside Stave's SQLite database, as a
`child-task` run with a `task` origin and one `child-task-turn` step:

```json
{
  "runId": "child-task:parent-task-1:docs-review",
  "childTaskId": "6f1c2f1e-1b6b-4d2e-9d21-6f5a0d2c4b77",
  "childWorkspaceId": "workspace-docs-review",
  "providerId": "codex",
  "lifecycle": "one-turn",
  "phase": "completed",
  "reason": null
}
```

Set `STAVE_CHILD_TASK_CONCURRENCY` to change how many children one parent task
may have running at once (default 3, maximum 16).

## Limitations And Advanced Options

- A parent never receives the child's transcript. Receipts carry identity, phase
  and terminal reason only; open the child task to read the conversation.
- A cancelled delegation is not restarted by `retry`. Use a new delegation key.
- Watching and steering a child is available in the UI, but *creating* one is
  not: delegation is driven by the MCP tools, so a child is always started by an
  agent rather than by a button.
- Detaching is one-way. A released delegation cannot be re-claimed; the child
  continues as an ordinary task.
- Creating a `new-worktree` child leaves the worktree in place when the child
  ends. Remove it through the normal workspace controls.

## Troubleshooting

### The delegation was refused with `invalid-ownership`

- Symptom: `stave_delegate_task` returns `accepted: false`,
  `reason: "invalid-ownership"`.
- Cause: the parent task id, the parent workspace id, and the project path do
  not describe the same place.
- Fix: read them from the current task's context block rather than assembling
  them by hand.

### The delegation was refused with `concurrency-limit-reached`

- Symptom: a new delegation is rejected while earlier ones still run.
- Cause: the parent already has the maximum number of live children.
- Fix: stop a child, wait for one to finish, or raise
  `STAVE_CHILD_TASK_CONCURRENCY`.

### A control was refused with `stale-identity`

- Symptom: Stop, Retry, Follow-up or Detach reports that the delegation moved on.
- Cause: the row the control was prepared from no longer describes the
  delegation — the attempt was bumped, the phase changed, or the child's turn
  ended between rendering and clicking.
- Fix: none needed; the refusal is the safe outcome. The rows refresh on their
  own, so act on the updated row.

### A child's approval was auto-denied before it was noticed

- Symptom: a child task reports a denied action nobody answered.
- Cause: child interaction requests expire like any other; an unanswered
  approval auto-denies after a few minutes.
- Fix: delegate with `permissionProfile: "auto"` for work that should run
  unattended, and reserve `guided` for children being watched.

### A child shows `interrupted` after a restart

- Symptom: a delegation that was running before a restart now reads
  `interrupted`.
- Cause: on restart Stave compares each delegation against its live child task.
  The child had no active turn and no completed turn to attribute the run to.
- Fix: re-send the delegation with `retry: true` to start a new attempt on the
  same child task.

## Related Docs

- [`docs/architecture/agent-platform-taxonomy.md`](../architecture/agent-platform-taxonomy.md)
- [`docs/architecture/run-core.md`](../architecture/run-core.md)
- [`docs/features/local-mcp-user-guide.md`](local-mcp-user-guide.md)
- [`docs/features/routines.md`](routines.md)
- [`docs/features/provider-sandbox-and-approval.md`](provider-sandbox-and-approval.md)
