# Projects

## Summary

A project takes a goal that needs several missions — moving a set of screens,
a migration, a feature in parts. Its coordinator, a Claude or Codex task,
breaks the goal into missions, starts each one on its own worktree once you
approve it, reads their reports when they end and proposes what comes next.

You brief the goal once and then approve, sign off and review. The coordinator
never edits files; the work happens in [missions](missions.md).

## When To Use It

- The goal splits into pieces that can run side by side or one after another,
  each a mission of its own.
- You want one place that shows what needs you, what runs and what is done
  across those missions.
- Decisions made in one piece should carry into the next ("use the shared
  Table component").
- For a single outcome, start a [mission](missions.md) directly. For
  scheduled work, use an [automation](automations.md).

## Before You Start

- Stave's local tools are on (Settings → Developer → Local MCP). The
  coordinator reads the project and starts missions through them, and each
  mission reports its stages through them.
- The coordinator runs on a Claude or Codex task: a new one, or the task in
  view.
- The playbooks the coordinator may pick are your saved playbooks and the
  starter templates (Automations → Playbooks).

## Quick Start

1. Open **Projects** in the sidebar (or **New project…** in the command
   palette).
2. Click **New project**, name it and say what done looks like in **Goal**.
3. Pick the **Coordinator**: **New Claude task**, **New Codex task** or
   **Task in view**. Leave **Ask before starting each mission** on.
4. Click **Create and plan**. The coordinator reads the goal and proposes
   missions.
5. In **Needs you**, check each proposal's playbook and click **Start
   mission**. Each one starts on a new worktree.

## Interface Walkthrough

### Entry Points

- **Projects** in the sidebar, under Fleet View, with each open project and
  the number of things that need you.
- **Open projects** and **New project…** in the command palette.
- The project count in the Fleet View header.

### Projects view

Every project is on the left, open ones first, then **Ended**. The one in
focus is on the right. On a narrow window a picker replaces the list.

### Project home

- **Header**: the name, the state (Active, Paused, Completed, Cancelled) and
  the goal, then chips for what needs you, what runs and what is done, and
  how missions start ("You start each mission · up to 2 at once"). **Pause**
  stops the coordinator's automatic turns and new starts; the ⋯ menu marks
  the goal met or cancels the project.
- **Coordinator**: its latest summary of the project and when it last woke.
  **Open coordinator** opens its task, where you can talk to it like any
  task.
- **Needs you**: proposals waiting for **Start mission** or **Dismiss**, and
  missions that wait for your sign-off or are blocked or stuck (**Review**).
- **Running** and **Done**: each mission with its playbook, current stage,
  provider and a stage track. **Open** goes to its task; **PR** opens its
  pull request.
- **Memory**: decisions from finished missions and the coordinator's notes.
  **Accept** a decision to have later missions follow it; **×** removes it.
- **Library**: pull requests, issues, previews and documents from mission
  reports, with **Verified** on links Stave produced itself.
- **Settings**: **Missions at once** (1–4), **Ask before starting** and
  **Accept decisions automatically**.

## How The Coordinator Works

- It wakes when a mission of the project ends, waits for your sign-off, or is
  blocked or stuck — never on every stage. Changes that land while it is in a
  turn wait and arrive together in its next turn.
- Each wake prompt names the missions and their one-line summaries. The
  coordinator reads full reports with `stave_get_mission_report`, starts work
  with `stave_start_mission`, and records what it learned or a new summary
  with `stave_note_project`. `stave_get_project` and `stave_list_missions`
  show the project. These tools exist only in the coordinator's turns.
- With **Ask before starting** on, `stave_start_mission` creates a proposal
  you approve. With it off, missions start on their own up to **Missions at
  once**.
- The coordinator's turns are read-only: Claude cannot edit files and Codex
  runs read-only.
- After 24 automatic turns in a day, the project pauses and tells you;
  **Resume** lets it continue.

## Common Workflows

### Run two pieces in parallel

Set **Missions at once** to 2 or more. Approve both proposals; each starts on
its own worktree, on the provider the coordinator chose for it.

### Carry a decision into later missions

When a mission ends, its reported decisions appear in **Memory** as **To
review**. **Accept** the ones that should hold. Every later mission of the
project receives accepted memory as context; missions outside the project
never do. Turn on **Accept decisions automatically** to skip the review.

### Finish a project

When the goal is met, choose ⋯ → **Mark the goal met**. Running missions
continue on their own; the coordinator stops waking.

## Files And Data

- Projects, proposals, project events and memory live in Stave's local
  database, next to missions. A project's missions are ordinary missions that
  record their project.
- Saved playbooks come from your settings; Stave hands them to the host so
  the coordinator can pick them.

## Limitations And Advanced Options

- The coordinator edits no files; it plans and follows.
- A project mission runs on its provider's default model.
- While Stave is closed nothing runs. On relaunch the project continues:
  missions resume where they were, and a start that was interrupted halfway
  is marked failed and reported instead of being started twice.
- Projects do not yet start from outside events (an assigned issue, failing
  checks), and there is no per-project usage view.
- The collapsed sidebar has no Projects entry; use the command palette.

## Troubleshooting

### The coordinator does not wake

Check that the project is **Active** (a paused project shows why under its
goal), that the coordinator task still exists and is not archived, and that
Local MCP is on. A wake that fails to start is reported once, not retried in
a loop; send the coordinator a message or **Resume** the project.

### A proposal shows as failed

Stave could not create the worktree or start the mission. The proposal keeps
the reason. Ask the coordinator to propose it again; the same start is never
replayed on its own.

## Related Docs

- [Missions](missions.md)
- [Playbooks](playbooks.md)
- [Fleet Action Required](fleet-needs-me.md)
