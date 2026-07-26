# Fleet Needs Me

## Summary

Fleet is Stave's cross-workspace action inbox. Its default `Needs me` view
combines pending questions and approvals, unread failed or completed turns, and
actionable pull request states in one urgency-ordered list.

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
2. Review the `Needs me` list, which starts with questions and approvals.
3. Select an item to open its exact task or workspace.
4. Approve or deny approval requests, mark results as reviewed, or open the
   linked pull request from the item actions.

## Interface Walkthrough

### Entry Points

- Top bar: the Fleet button shows the total number of known actionable items.
- Workspace sidebar: workspaces with a known need are promoted into the active
  workspace list and show the highest-priority need icon.
- Fleet view: `Needs me` is the default task filter and the action inbox stays
  above the workspace lifecycle lanes.

### Key Controls

- `Open next item`: opens the next item in urgency order.
- `Approve` and `Deny`: resolve a durable approval request without first opening
  the task.
- `Mark reviewed` or `Mark read`: dismisses a completed or failed turn from the
  current queue while keeping notification history.
- `Open PR`: opens the pull request for review blockers or merge-ready work.
- `N`: opens the next known actionable item while Fleet has keyboard focus.

## Common Workflows

### Clear Pending Agent Requests

1. Start at the top of `Needs me`.
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
- Live task state is preferred when available.
- Durable notifications keep pending interactions and unread turn outcomes
  visible when a workspace runtime is not loaded.
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

### A Workspace Is Not In Needs Me

- Symptom: a workspace has recent work but no Fleet item.
- Cause: Fleet shows actionable states, not all recent activity.
- Fix: check its task or PR directly. It appears when a question, approval,
  failed turn, unread result, PR blocker, or merge-ready state exists.

### A Completed Result Disappeared

- Symptom: a result no longer appears after selecting `Mark reviewed`.
- Cause: reviewed completion notifications are removed from the current action
  queue.
- Fix: open the notification center's history view to find the original item.

## Related Docs

- [Notifications](notifications.md)
- [Workspace Pull Request Status](workspace-pr-status.md)
- [Latest Turn Summary](workspace-latest-turn-summary.md)
