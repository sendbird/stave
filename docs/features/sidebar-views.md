# Sidebar Views

## Summary

The left sidebar has two views and shows one at a time. `Projects` is the
project → workspace tree: it sorts by where a workspace lives. `Work queue`
groups every workspace into attention lanes: it sorts by what the workspace
wants from you. A toggle in the sidebar header swaps between them, and the
sidebar reopens in whichever view you used last.

Both views list the same workspaces, so either one on its own is a complete way
to navigate. Switching is a change of question, not a change of scope.

## When To Use It

- Use `Projects` when you know where you are going — you want a specific
  project's workspace, or you want to reorder, rename, or archive one.
- Use `Work queue` when you want the app to tell you where to go — which agents
  are blocked, which are still running, which finished and are waiting for a
  look.
- Use Fleet View instead when you want the full cross-project detail view rather
  than a navigation surface.

## Before You Start

- Open at least one project in Stave.
- Expand the left sidebar (the toggle lives in the sidebar's own header bar and
  is hidden while the sidebar is collapsed to its icon rail).

## Quick Start

1. Expand the left sidebar. The two-button toggle sits at the left of the bar
   above the search box.
2. Click the checklist icon to switch to `Work queue`. Lane headings replace the
   project tree.
3. Click any row to open that workspace, switching projects if needed.
4. Click the folder-tree icon to go back to `Projects`.

## Interface Walkthrough

### Entry Points

- Sidebar header bar: the `Projects` / `Work queue` toggle.
- `Settings → Design → Sidebar → Sidebar View`: the same two choices. Both
  controls write the same preference, so neither can disagree with the other.

### Projects View

The project → workspace tree, unchanged: drag to reorder, rename in place, the
`⋮` row menu for task history, workspace settings, and archive, and the row
density menu (`Expanded` / `Compact`) in the header bar.

### Work Queue View

Every workspace, grouped into four lanes in fixed priority order:

| Lane | Meaning |
| --- | --- |
| `Action required` | Blocked on you — a question, an approval, a failed run, a PR that cannot merge, or a task sitting in a waiting/error state |
| `In progress` | An agent is running right now |
| `In review` | Finished work nobody has looked at yet |
| `Idle` | Nothing pending |

- Inside a lane, rows are ordered: the workspace you are standing in first, then
  the most urgent attention item, then status, then most recently opened
  project.
- A workspace appears in exactly one lane, and an empty lane renders no header.
- Each lane header shows its row count and collapses on click. Collapsing is
  session-local — it answers "what am I ignoring right now", not "how do I like
  my sidebar" — so it resets on restart, the same way collapsed projects do.
- The trailing text on a row is the project name. The queue is the one view that
  interleaves projects, so it has to state in text what the tree states by
  position.

### Search

The search box filters both views through the same predicate, so a query narrows
the queue exactly the way it narrows the tree.

## Files And Data

- The current view is stored as a single preference and persists across
  restarts. The header toggle and the settings control write the same key.
- An unrecognized stored value falls back to `Projects`.

## Limitations And Advanced Options

- The collapsed icon rail shows one flat list regardless of view; the toggle is
  an expanded-sidebar control.
- Row actions (`⋮` menu, drag-to-reorder, rename in place) exist only in
  `Projects`. Open the workspace from the queue and use the tree, Fleet View, or
  workspace settings for those.
- The `Work queue` lanes are derived from attention items and task state only.
  The last lane is `Idle`, not `Done`: a merged PR and a workspace nobody has
  touched are indistinguishable without subscribing the sidebar to PR status, so
  claiming "Done" would overstate what the data supports.

## Troubleshooting

### The Toggle Is Missing

- Symptom: no view toggle in the sidebar.
- Cause: the sidebar is collapsed to the icon rail.
- Fix: expand the sidebar first.

### A Lane Disappeared

- Symptom: a lane you saw earlier is gone.
- Cause: it has no members. Empty lanes are dropped rather than rendered as a
  bare header.
- Fix: none needed.

### The Queue Looks Long

- Symptom: many rows under `Idle`.
- Cause: the queue lists every workspace on purpose, so it can reach anything
  the tree can reach.
- Fix: collapse the `Idle` lane header, or filter with the search box.

## Related Docs

- [Fleet Action Required](fleet-needs-me.md)
