# Sidebar Views

## Summary

The left sidebar has two views and shows one at a time. `Repositories` is the
repository → workspace tree: it sorts by where a workspace lives. `Work queue`
groups every workspace into attention lanes: it sorts by what the workspace
wants from you. A toggle in the sidebar header swaps between them, and the
sidebar reopens in whichever view you used last.

Both views list the same workspaces, so either one on its own is a complete way
to navigate. Switching is a change of question, not a change of scope.

Above either view, the sidebar's top navigation holds **Fleet View**,
**Agents** with each agent at work and the number of things that need you (its
**Performance** tab compares ended runs), and **AI usage**.

## When To Use It

- Use `Repositories` when you know where you are going — you want a specific
  repository's workspace, or you want to reorder, rename, or archive one.
- Use `Work queue` when you want the app to tell you where to go — which agents
  are blocked, which are still running, which finished and are waiting for a
  look.
- Use Fleet View, the Work queue's full view, when you want every workspace as a
  card with its tasks, the attention rail and board filters. Open it from the
  expand button in the sidebar header bar while `Work queue` is showing.

## Before You Start

- Open at least one repository in Stave.
- Expand the left sidebar (the toggle lives in the sidebar's own header bar and
  is hidden while the sidebar is collapsed to its icon rail).

## Quick Start

1. Expand the left sidebar. The two-button toggle sits at the left of the bar
   above the search box.
2. Click the checklist icon to switch to `Work queue`. Lane headings replace the
   repository tree.
3. Click any row to open that workspace, switching repositories if needed.
4. Click the folder-tree icon to go back to `Repositories`.

## Interface Walkthrough

### Entry Points

- Sidebar header bar: the `Repositories` / `Work queue` toggle.
- Top navigation: **Fleet View**, **Agents** and the agents at work (a count
  on each), and **AI usage**. Clicking an agent opens it in the Agents tab.
  Agents also has a **Performance** tab, which compares ended runs across
  workspaces; see [Agent performance and task outputs](results.md).
- Work queue header bar: the expand button opens Fleet View, the queue's full view.
- `Settings → Design → Sidebar → Sidebar View`: the same two choices. Both
  controls write the same preference, so neither can disagree with the other.

### Repositories View

The repository → workspace tree, unchanged: drag to reorder, rename in place, the
`⋮` row menu for task history, workspace settings, and archive, and the row
density menu (`Expanded` / `Compact`) in the header bar.

### Work Queue View

Every workspace, grouped into four lanes in fixed priority order:

| Lane | Meaning |
| --- | --- |
| `Action required` | Blocked on you — a question, an approval, a failed run, a PR that cannot merge, a task sitting in a waiting/error state, or an [agent run](agent-runs.md) waiting for your sign-off, blocked, stuck, paused by Stave or stopped short of its goal |
| `In progress` | An agent is running right now, including an agent run running its stages or watching checks |
| `In review` | Finished work nobody has looked at yet, such as an agent run's open pull request |
| `Idle` | Nothing pending |

- Inside a lane, rows are ordered: the workspace you are standing in first, then
  the most urgent attention item, then status, then most recently opened
  repository.
- The same lanes and order are used by the Fleet View board (cards and the tasks
  on each card, with a workspace's own last activity as the recency) and by the
  Agents surface (agents at work in the sidebar, and each agent's Work list), so
  what needs you is first everywhere.
- A workspace appears in exactly one lane, and an empty lane renders no header.
- After the lanes come two shelves for workspaces set aside: `Snoozed` and
  `Settled` (see [Settling](#settling)).
- Each header shows its row count and collapses on click. `In progress` and the
  two shelves start collapsed: a running agent needs nothing from you, and the
  shelves exist to be out of the way. Collapsing is session-local — it answers
  "what am I ignoring right now", not "how do I like my sidebar" — so it resets
  on restart, the same way collapsed repositories do.
- The trailing text on a row is the repository name. The queue is the one view that
  interleaves repositories, so it has to state in text what the tree states by
  position. On a shelf it says why the row is there instead (`PR merged`,
  `No recent activity`, `Settled`, or `Until` a time).
- Hover a row for its `⋮` menu: **Settle**, **Snooze** for an hour, until
  tomorrow, or until next week, **Bring back to the queue** on a shelved row, and
  **Never settle automatically**.

### Settling

Settling takes a workspace out of the lanes once nothing in it needs you. It
does not touch the workspace: the worktree, branch, conversation, and terminals
stay as they are, and the workspace still appears in `Repositories`.

- **Settle** puts it on the `Settled` shelf. **Snooze** puts it on `Snoozed`
  until the time you pick.
- Every settle or snooze you make shows a toast with **Undo**.
- A shelved workspace comes back by itself when there is new activity in it: a
  message you send, a turn, or a new result. Anything that needs you — a
  question, an approval, a failed run, a running turn — always shows in its lane,
  shelved or not. Opening a shelved workspace just to look does not bring it
  back; use **Bring back to the queue** for that.

Two rules settle a workspace automatically. Both skip the workspace you are in,
the repository's default workspace, a workspace with an open pull request, and
anything not in `Idle`:

| Rule | Settles when | Setting |
| --- | --- | --- |
| After the PR merges | its pull request merged after your last message there | `Settings → Design → Sidebar → Settle after the PR merges` (on by default) |
| When inactive | no message, turn, or visit for the chosen time | `Settings → Design → Sidebar → Settle when inactive` (7 days by default; 3, 14, 30 days, or off) |

- If you keep working in a workspace after its PR merges, the merge rule leaves
  it alone, so a merged workspace you plan to continue stays in the queue.
- Automatic settles show one toast for the batch, with **Undo**.
- **Bring back to the queue** and **Undo** restart both rules from that moment.
- **Never settle automatically** exempts one workspace from both rules; you can
  still settle it by hand.

### Search

The search box filters both views through the same predicate, so a query narrows
the queue exactly the way it narrows the tree.

## Files And Data

- The current view is stored as a single preference and persists across
  restarts. The header toggle and the settings control write the same key.
- An unrecognized stored value falls back to `Repositories`.
- Settle and snooze state, the last message time used by the merge rule, and
  the per-workspace opt-out are stored on this computer with the rest of the
  sidebar state. Archiving a workspace removes them.

## Limitations And Advanced Options

- The collapsed icon rail shows one flat list regardless of view; the toggle is
  an expanded-sidebar control. The rail keeps **Fleet View**, **Agents** and
  **AI usage** as icons; a dot on Agents means an agent needs you.
- Drag-to-reorder, rename in place, and the workspace `⋮` menu (task history,
  workspace settings, archive) exist only in `Repositories`. The queue's own `⋮`
  menu is for settling.
- The `Work queue` lanes are derived from attention items and task state only.
  The last lane is `Idle`, not `Done`; a merged workspace moves to `Settled`
  through the merge rule instead.
- Pull request status is read for the current repository's workspaces, so in
  other repositories only the inactivity rule settles automatically.

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

### A Workspace Left The Queue

- Symptom: a workspace you expected is not in any lane.
- Cause: it was settled or snoozed, by you or by a rule.
- Fix: expand `Settled` or `Snoozed` and choose **Bring back to the queue** from
  its `⋮` menu, or just send a message in it. To stop automatic settling, turn the
  rules off in `Settings → Design → Sidebar`, or choose **Never settle
  automatically** for that workspace.

### The Queue Looks Long

- Symptom: many rows under `Idle`.
- Cause: the queue lists every workspace on purpose, so it can reach anything
  the tree can reach.
- Fix: settle or snooze what you are done with, collapse the `Idle` lane header,
  or filter with the search box.

## Related Docs

- [Fleet Action Required](fleet-needs-me.md)
