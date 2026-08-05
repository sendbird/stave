# Sidebar Active Workspaces

## Summary

The workspace sidebar keeps a ranked `Active workspaces` shortlist above the
project list so the workspaces that matter right now stay one click away. Each
row can be removed by hand when you consider it unimportant, and removed rows
come back on their own once the workspace needs you again or you open it.

## When To Use It

- Use the list to jump between the handful of workspaces you are actively
  driving across projects.
- Remove rows that the ranking keeps surfacing but that you do not care about
  right now, such as a long-running background workspace or another project's
  last-opened workspace.
- Use Fleet's `Needs me` rail instead when you want the full actionable queue
  rather than a navigation shortlist.

## Before You Start

- Open at least one project in Stave.
- Keep `Settings → Design → Sidebar → Active Workspaces` enabled (it is on by
  default).

## Quick Start

1. Expand the left sidebar. The `Active workspaces` heading appears above
   `Projects` whenever at least one workspace qualifies.
2. Click a row to open that workspace, switching projects if needed.
3. Hover a row you do not care about and click the `×` (`Hide from Active
   Workspaces`) button to remove it.

## Interface Walkthrough

### Entry Points

- Expanded sidebar: the `Active workspaces` section above the `Projects`
  header.
- `Settings → Design → Sidebar`: the `Active Workspaces` toggle, the row limit
  slider, and the `Hidden Workspaces` restore control.

### How Rows Are Selected And Ordered

A workspace earns a row for any of these reasons:

- It is the workspace you are standing in.
- It is a project's representative workspace — the one that project would
  reopen into.
- It is noteworthy: an agent is waiting for your input or approval, it carries
  a visible attention need from Fleet, or its best task status is `error` or
  `running`. A completed result waiting for review never promotes a workspace
  by itself.

Rows are ordered: current workspace first, then the most urgent attention
need, then status (waiting → error → running → idle), then most recently
opened project. The list is capped by the `Active Workspace Rows` setting.

### Removing A Row

- Hover (or keyboard-focus) any row except the current workspace and click the
  `×` button.
- Removal hides the low-urgency listing reasons only: representative,
  `error`, and `running` rows disappear.
- A removed workspace still returns while an agent is waiting on you — a
  pending question, approval, or visible attention need always resurfaces it.
  Hiding a stalled agent would bury the signal the list exists to show.
- The current workspace has no remove button; it is the "you are here" marker.

### Getting A Row Back

- Open the workspace from the project list (or anywhere else). Deliberately
  activating a workspace clears its removal automatically.
- Or use `Settings → Design → Sidebar → Hidden Workspaces → Restore` to clear
  every removal at once. The control only appears while at least one removal
  is in effect.

## Files And Data

- Removals are stored per workspace id with the removal time and persist
  across restarts alongside the rest of the sidebar state.
- A removal is compared against the workspace's last deliberate activation:
  once you activate the workspace again, the stamp lapses and the row can
  reappear.
- Stamps for workspaces Stave no longer remembers are pruned on startup.

## Limitations And Advanced Options

- Removal affects only the sidebar `Active workspaces` shortlist. Fleet View,
  the `Needs me` rail, notifications, and the project list are unaffected.
- You cannot hide a workspace that is currently waiting on your input or
  approval; answer or dismiss the underlying request instead.
- Turning the whole section off is still available via the `Active
  Workspaces` toggle in Settings.

## Troubleshooting

### A Removed Workspace Came Back

- Symptom: a row you removed reappears.
- Cause: the workspace started waiting on you, or you opened it again —
  both intentionally end the removal.
- Fix: none needed; remove it again once the attention state is resolved if
  you still do not want it listed.

### The Remove Button Is Missing

- Symptom: no `×` appears on hover.
- Cause: the row is the workspace you are currently in, which cannot be
  hidden.
- Fix: switch to another workspace first if you really want to hide it.

## Related Docs

- [Fleet Needs Me](fleet-needs-me.md)
