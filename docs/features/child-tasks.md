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

The child itself is an ordinary task: it shows up in its workspace's task list,
in Fleet, and in the sidebar work queue like any other.

### Key Controls

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

Call `stave_list_child_tasks`. Each entry carries the child's task and workspace
id, provider, lifecycle, phase and terminal reason.

The same summary is injected into the parent's context automatically before each
of its turns, so an agent that delegated work sees where its children stand
without asking.

### Stop A Child

Call `stave_stop_child_task` with the parent task id and the delegation key. The
ledger row is cancelled durably; the child task is asked to stop as a best
effort, because a child that already ended is a successful stop.

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
- Delegation is driven by MCP tools; there is no dedicated UI for creating a
  child task.
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
