# Fleet Action Required

## Summary

Fleet is Stave's cross-workspace action inbox. Its fixed `Action required` rail
combines pending questions and approvals, unread failed or completed turns, and
actionable pull request states in one urgency-ordered list.

Fleet is an auxiliary surface. The task window stays the primary place to answer
a question, resolve an approval, and review a result, and doing the work there
clears the matching Fleet item. Fleet only adds a cross-workspace overview and
optional shortcuts on top of that.

## When To Use It

- Use Fleet when several projects or workspaces are active at once.
- Use it to find the next task that needs a response without opening every
  workspace.
- Use the notification center when you want notification history rather than a
  current action queue.

## Before You Start

- Open at least one project in Stave.
- Keep notifications enabled if you want closed or unloaded workspaces to stay
  represented after their live runtime state is no longer loaded.
- Connect GitHub PR status for workspaces where you want review blockers and
  merge readiness to appear.

## Quick Start

1. Open Fleet from the top-bar fleet button or the workspace sidebar.
2. Review the fixed `Action required` rail, which keeps questions and approvals
   ahead of the folded `Worth a look` review queue.
3. Select an item to open its exact task or workspace.
4. Approve or deny approval requests, mark results as reviewed, or open the
   linked pull request from the item actions.

## Interface Walkthrough

### Entry Points

- Top bar: the Fleet button shows the total number of known actionable items.
- Workspace sidebar: switch to `Work queue` to group every workspace into
  `Action required`, `In progress`, `In review`, or `Idle`. Blocking attention
  puts a workspace in `Action required`; an unread result without a blocker
  belongs in `In review`.
- Fleet view: `Action required` is a layout-level rail. It stays visible while
  board filters change; on narrow screens it becomes a compact top rail. The
  board itself uses workspace cards and activity filters (`Active`, `Running`,
  `Blocked`, and `All`) rather than a task timeline.
- Workspace cards show open tasks, provider and pull-request status, and todo
  progress. Dormant workspaces stay available under `All`; fabricated empty
  default rows are hidden until they have real history or activity.

### Key Controls

- `Open next item`: opens the next item in urgency order.
- `Approve` and `Deny`: resolve a durable approval request without first opening
  the task.
- `Mark reviewed` or `Mark read`: dismisses a completed or failed turn from the
  current queue while keeping notification history.
- `Open PR`: opens the pull request for review blockers or merge-ready work.
- `N`: opens the next known actionable item while Fleet has keyboard focus.

### Items That Clear Themselves

- Opening a task in the task window marks its completed and failed turns as
  reviewed. A turn that finishes while you are already watching that task never
  enters the queue.
- Answering a question or resolving an approval in the task window clears the
  item, including when an agent answers through the managed host.
- Stopping a turn, archiving a task, or restarting Stave settles the requests
  that turn can no longer accept.
- Fleet cannot independently dismiss a pending question or approval. The task's
  provider response or terminal state is authoritative for that request.

## Common Workflows

### Clear Pending Agent Requests

1. Start at the top of `Action required`.
2. Answer questions in their task and resolve approvals from the inbox or task.
3. Continue with failed runs, pull request blockers, completed results, and
   merge-ready work.

### Review A Cold Workspace

1. Open Fleet after restarting Stave or switching away from a project.
2. Select a durable notification-backed item.
3. Stave opens the matching project, workspace, and task before showing the
   request or result.

## Files And Data

- Fleet does not create a separate task ledger or execution database.
- Live task state is preferred when available. Historical waiting/error labels
  do not make a workspace look `Running` after its provider turn has ended.
- Durable notifications keep pending interactions and unread turn outcomes
  visible when a workspace runtime is not loaded. Notifications for archived or
  legacy tasks are excluded, and a notification is settled as soon as the task
  window shows that the request is no longer waiting.
- Fleet records the last deliberate workspace activity separately from
  snapshot-write timestamps, so an untouched remembered workspace can become
  dormant without making the whole project look recently active.
- Stave-owned managed requests can still be answered from the task,
  notification, or Fleet shortcut. Externally owned managed requests are not
  exposed as Stave actions.
- Pull request status contributes only actionable blocker and merge-ready
  states.

## Limitations And Advanced Options

- Fleet initially opens user-input requests in their task; it does not render the
  full answer form inline.
- Pull request actions open GitHub. Fleet does not merge, retry checks, or edit a
  pull request.
- An unloaded workspace without live state, a durable notification, or cached PR
  status cannot be counted as inspected.

## Troubleshooting

### A Workspace Is Not In Action Required

- Symptom: a workspace has recent work but no Fleet item.
- Cause: Fleet shows actionable states, not all recent activity.
- Fix: check its task or PR directly. It appears when a question, approval,
  failed turn, unread result, PR blocker, or merge-ready state exists.

### A Completed Result Disappeared

- Symptom: a result no longer appears after selecting `Mark reviewed`, or after
  opening its task.
- Cause: reviewing a turn in the task window counts as handling it, so its
  completion notification leaves the current action queue.
- Fix: open the notification center's history view to find the original item.

### A Question Or Approval Belongs To A Finished Task

- Symptom: an item points at a task whose turn already ended.
- Cause: the request was never answered before the turn stopped, and its state
  had not been reconciled yet.
- Fix: open the item. Once the task window loads, Stave settles the request
  automatically from the task's terminal state.

## Related Docs

- [Notifications](notifications.md)
- [Latest Turn Summary](workspace-latest-turn-summary.md)
- [Sidebar Views](sidebar-views.md)
