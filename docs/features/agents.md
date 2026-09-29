# Agents

## Summary

An agent is a saved worker you hand work to: its instructions, the model it
runs on, the tools it may use, a default permission and where it works. Assign
work to an agent and Stave makes the task — in a new worktree or in the current
workspace — and starts it. Every later turn of that task runs as the same
version of the agent.

Saving an agent starts nothing and grants nothing. Each assignment records its
own start, and the permission you see is only the default the task starts with.

## When To Use It

- You keep explaining the same role to a model: "review this commit, change
  nothing", "implement in a fresh worktree and verify".
- You want the same role on Claude, Codex, Cursor or Kiro without rewriting it.
- Your repository already has agent files for a coding agent and you want to
  use them from Stave.

For a sequence of stages, use a [playbook](playbooks.md). For a one-off prompt,
use a macro.

## Quick Start

Open the **Agents** surface from the sidebar, the command palette
(`Open Agents`), or `Cmd/Ctrl+K` then `G`. It has three tabs: **Agents**,
**Playbooks** and **My standards**.

1. Open **Agents** in the sidebar and stay on the **Agents** tab.
2. Press **New agent**, name it, and start from **Blank** or from a template
   (any built-in or repository agent). Or **Duplicate** any agent to edit a copy.
3. Press **Start work…** in the agent's header. Kickoff opens with the agent
   preselected as the worker.
4. Describe the work as the kickoff source, then **Create and start** (or leave
   the first task ready without starting).
5. **Open task** to follow it. The task's **Flow** panel shows what was
   assigned, its stages and the tasks it delegated.

### Other ways to start work with an agent

- **Issues**: a ticket's context menu, or the detail pane's ⋯ menu, has
  **Assign to agent**. The ticket's key, title and link become the kickoff
  source. The ticket's own assignee does not change.
- **Composer**: type `!assign` in any task's composer, including a new one. The
  rest of the draft becomes the kickoff source. The agent works in its own task.
- **Command palette**: **Start work with an agent…** opens Kickoff with the
  agent picker ready.

All of these open **Kickoff** with **Who** set. On the first screen, choose
**Me** or an agent; with an agent, **Start now** starts a task from the source
right away. On the review screen, **Who / How / Where** set the worker, whether
it runs as one task or a playbook mission, and the new worktree and its base.

## Interface Walkthrough

### Agents tab

- **Custom**, **From repository** and **Built-in** agents, with search. Each row
  shows an avatar — an initials disc in the agent's colour.
- **New agent**: name it, then start from **Blank** (Auto model, Auto
  permission, a new worktree, usable as a main agent) or from a template (any
  built-in or repository agent). Nothing is saved until you save the editor;
  **Cancel** discards the draft. The command palette's **New agent** and the
  empty state open the same dialog.
- **Profile header**: the avatar, the name, **Use when**, and chips for source,
  model, permission and where the agent works.
- **As a main agent**: per provider, whether the instructions and tool limits
  are **Enforced**, **Asked in instructions** (stated to the model, not
  enforced), or **Not available**.
- **Duplicate**, **Archive**, **Restore** and **Delete**. Built-in and
  repository agents are read only; an update never overwrites your copy.
  Archiving stops new assignments only.
- **Work**: the agent's assignments and their state: **Preparing**,
  **Started**, **Couldn't start** or **Interrupted**.

### Editing an agent

A custom agent's editor is grouped into sections:

- **Profile**: name, colour, **Use when** and **Don't use when**.
- **Instructions**: the agent's instructions and its skills.
- **Model**: **Auto-routing** with an optional task class, or a **Fixed**
  provider, model and effort.
- **Tools & limits**: the allowed and denied tool lists, max turns and
  concurrency.
- **Access**: permission, where it works, what it is usable as, and its report
  sections.

A field that fails a rule shows the reason inline (for example, a read-only
agent cannot take a new worktree, and a tool cannot be both allowed and denied).

### Deleting an agent

**Delete** removes a custom agent from your settings. Past assignments keep
their own snapshot, so an agent's history still shows its name after it is gone.
If a playbook stage or a project still names the agent, deletion is blocked and
the dialog lists where — **Archive instead**, or remove those references first.
Running or waiting tasks are shown for context but do not block: they keep the
version they started with and finish on their own.

### Avatars elsewhere

An agent's avatar also appears next to its work in the sidebar (with a status
dot — a green dot for running, an amber dot when it needs you), in the Kickoff
**Who** picker, on the Fleet task badge, and on the assignment node of a task's
**Flow** panel. Built-in and repository agents get a stable colour derived from
their id; a custom agent's colour is chosen in its **Profile** section.

### Usable as and the Worker picker

A custom agent's **Usable as** chooses where it can be used: **Main agent**
(Start work / Kickoff), **Worker** (the composer's Worker mode) and **Delegated
task**. Duplicate the built-in **Reviewer** and turn on **Main agent** to start
work with it directly.

Custom agents usable as a Worker appear under **Custom agents** in the
composer's Worker menu. Picking one copies its instructions and tool list into
this task's Worker; edit the agent and pick it again to refresh the copy.
Picking a preset afterwards clears it.

### My standards

**My standards**, its own tab on the Agents surface, holds your own rules for
every agent you run — how you want code written, reviewed or reported. Turned
on, they are added after each agent's instructions when you assign work,
delegate to an agent or pick one as a Worker. A task keeps the standards it
started with; **What it received** lists them as a source. They stay in your
settings and are never written into an exported agent file.

### Export

**Export** in an agent's details shows the Claude or Codex agent file the agent
becomes and the path it goes to. **Write to repository** writes it into the
open workspace; when a file is already at that path, a second **Replace**
press is needed. The file never carries a permission above the provider's
default — an **Auto** agent is written without one — and fields the format has
no place for are listed under **Not in the file**. Commit the file to share the
agent with the team.

### Agents from the repository

Stave lists the agent files the open workspace already keeps for coding agents:

| Folder | Files |
| --- | --- |
| .claude/agents | Markdown files, including subfolders |
| .codex/agents | TOML files |
| .kiro/agents | JSON and Markdown files |
| .cursor/agents | Markdown files |
| .github, agents folder | Files ending in .agent.md |

Files are read, never written. Use the reload button next to search after
editing a file. A repository agent's details show **Read from the file**: each
field that was **Not imported** (it would run commands or skip approvals),
**Left out** (Stave has no place for it) or **Changed**.

When a file has no permission setting, a tool list without file-editing tools
makes it **Read only**; otherwise it starts as **Guided**, never **Auto**.

A file that could not be read, or whose agent has the same id as a custom or
built-in agent, is listed under **agent files were not used** with the reason.
A repository file never replaces an agent you made or a built-in one; rename
the agent in the file to use it. Duplicate a repository agent to edit a copy.

### Flow panel

The right rail's **Flow** panel shows one task's flow. Every task has a base
flow, drawn from records that already exist:

- **Request** — the first message that opened the task.
- **Plan** — the latest plan or todo list the provider reported, with how many
  items are done; **Timeline** lists each item.
- **Changes** — the files changed, with the added and removed line totals.
- **Verification** — the structured result of the project's checks (pass, warn
  or fail) with how many ran. It reads the recorded result only and never
  guesses a pass or fail from a command's output.
- **Pull request** — the workspace's pull request, its status and its checks,
  once one exists.

A **Waiting for approval** or **Waiting for your answer** step appears whenever
the task is waiting on you. A task with no messages yet says it is waiting for
the first message.

When a task is assigned to an agent, the **assignment** heads the flow. When a
mission runs it, each mission stage shows its state and evidence (verified by
Stave or agent reported), and the base steps of the stage that is running now
nest under it; the delegated tasks that branched off a stage hang from it.
**Timeline** lists when a node started, was asked for changes, retried and
ended. The panel only reads the records that already exist; it changes nothing.

For a task assigned to an agent, **What it received** lists the version of the
agent the task runs (a short content hash), each instruction source that went
in, and how firmly the instructions, tool limits, model and permission are held
on that provider. If the agent was edited after the task started, the panel
says so: later turns keep the version used, and assigning again uses the edit.

### Fleet

A task that runs as an agent shows the agent's name, and typing the name in
Fleet's search finds its tasks.

## Configuration

| Setting | Values | Notes |
| --- | --- | --- |
| Works in | New worktree, Current workspace | New worktree creates a branch `agent/<agent>-<work>-<id>` |
| Permission | Read only, Manual, Guided, Auto | A ceiling on every turn of the task; a read-only agent works in the current workspace |
| Model | Auto-routing, or a fixed provider and model | Auto-routing uses your routing rules for the agent's task class |
| Usable as | Main agent, Worker, Delegated task | Built-in Worker presets are usable only as a Worker |

## Behavior Details

- Assigning twice from the same click starts the work once.
- If Stave stops while preparing, the assignment shows **Interrupted** with
  what it had made. It is never started again on its own.
- Cursor and Kiro receive the agent's instructions at the top of the first
  message; Claude and Codex receive them on their instruction channel.
- An agent's permission is a ceiling, never a grant. Every turn of the task —
  the first and each later one — keeps your permission settings where they are
  already narrower and lowers them where they are wider:

  | Agent | Claude | Codex | Cursor | Kiro |
  | --- | --- | --- | --- | --- |
  | Read only | Default mode, edit tools off | Read-only files, asks on request | Ask mode, Manual | Manual, told not to edit |
  | Manual | Default mode | Workspace files, asks before commands | Manual | Manual |
  | Guided | Accept edits | Workspace files, asks before commands | Guided | Manual |
  | Auto | Your settings | Your settings | Your settings | Your settings |

  Kiro has no read-only mode, so a read-only agent there asks before every tool
  and is only told not to edit; the Agents tab shows this as **Asked in
  instructions**.
- Tool limits are enforced where the provider supports them (for example, a
  Claude main agent's denied tools) and stated in the instructions elsewhere.

## Limitations

- Stave reads at most 50 agent files per repository.
- Export writes Claude and Codex agent files only.
- Hooks, inline MCP servers and approval-skipping modes in agent files are
  never imported.
- A worktree is a separate checkout, not a sandbox.

## Related

- [Playbooks](playbooks.md) and [Missions](missions.md)
- [Delegated tasks](delegated-tasks.md)
- [Auto-routing](auto-routing.md)
- [Fleet Action Required](fleet-needs-me.md)
