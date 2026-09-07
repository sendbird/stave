# Fleet Action Required

## Summary

Fleet is Stave's cross-workspace action inbox. Its fixed `Action required` rail
combines pending questions and approvals, unreviewed failed or completed runs, and
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
  puts a workspace in `Action required`; an unreviewed result without a blocker
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
- `Mark reviewed`: records your review of that specific run in durable result
  history. It does not mark the task or original ticket complete. Use `Results`
  in the task to inspect history or select `Reopen review`.
- `Open PR`: opens the pull request for review blockers or merge-ready work.
- `Snooze`: hides one item for 1 hour, 4 hours, 1 day, or 1 week. Available on
  every item, including blocking ones. A snooze is time-bounded and never
  answers the request behind the item, so the item returns on its own when the
  deadline passes.
- `Clear all` on `Worth a look`: acknowledges the whole review group in one
  action. It is deliberately absent from `Action required`, where an agent is
  still waiting for a real answer.
- `Restore`: brings every snoozed item back immediately. The rail always reports
  how many items a snooze is hiding, so nothing disappears without a count.
- `N`: opens the next known actionable item while Fleet has keyboard focus.

### Items That Clear Themselves

- Reading a finished turn in the task window acknowledges its `Result ready` or
  `Run failed` item. Stave requires the task window to be focused and showing
  that exact task for a couple of seconds before it counts as read, so stepping
  through tasks or passing through one does not acknowledge anything. A result
  that arrives while you are already watching serves the same short wait before
  it clears, and a turn that is still running is never acknowledged.
- Opening a task also reads its notifications. `Results` in the task still shows
  the saved review and offers `Reopen review`.
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
- Snoozes are stored per item, keyed by the item's identity rather than by its
  source, and expired rows are retired on read. A snooze hides an item; it never
  edits the request, result, or pull request behind it.
- `Clear all` routes each item to whichever mechanism owns it: a durable result
  is marked reviewed, a notification-backed item is read and resolved, and a
  pull-request item — whose state lives on GitHub and would be rebuilt on the
  next projection — is snoozed for a day instead.
- Durable notifications keep pending interactions visible; a separate SQLite
  result history preserves review state after notification reads, expiry, and
  cleanup. Old retained outcomes migrate as unreviewed, even if their notifications
  were read. Previously deleted notifications cannot be reconstructed by this
  migration. Notifications for archived or
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
- Result lists are paged. Fleet shows up to 200 pending results and reports when
  more exist; each task exposes its paged result history. A failed read is shown
  with a retry action, and a failed review write does not acknowledge the result.
- An unloaded workspace without live state, a durable result or notification, or cached PR
  status cannot be counted as inspected.

## Troubleshooting

### A Workspace Is Not In Action Required

- Symptom: a workspace has recent work but no Fleet item.
- Cause: Fleet shows actionable states, not all recent activity.
- Fix: check its task or PR directly. It appears when a question, approval,
  failed turn, unreviewed result, PR blocker, or merge-ready state exists.

### A Completed Result Disappeared

- Symptom: a result no longer appears in Fleet.
- Cause: it is reviewed and has left the pending queue, either from
  `Mark reviewed`, from `Clear all`, or because the task window showed that turn
  while focused for long enough to count as read.
- Fix: open the task's `Results` panel to inspect the saved review or reopen it.
  Clearing notifications alone never acknowledges a review.

### A Snoozed Item Has Not Come Back

- Symptom: an item is missing and the rail footer reports snoozed items.
- Cause: its snooze deadline has not passed yet.
- Fix: select `Restore` in the rail footer to bring every snoozed item back now.
  Snoozes survive a restart on the desktop app; in a browser session they are
  best-effort only.

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
