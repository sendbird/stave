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

1. Open **Automations** and choose the **Agents** tab.
2. Pick **Implementer** (built in), or **Duplicate** any agent to edit a copy.
3. In **Assign**, describe the work and when it counts as done.
4. Leave **Runs on** at **Auto-routing** or pick a provider, then **Assign**.
5. **Open task** to follow it. The task's **Flow** panel shows what was
   assigned, its stages and the tasks it delegated.

## Interface Walkthrough

### Agents tab

- **Custom**, **From repository** and **Built-in** agents, with search.
- **Use when / Don't use when**: when to hand work to this agent.
- **As a main agent**: per provider, whether the instructions and tool limits
  are **Enforced**, **Asked in instructions** (stated to the model, not
  enforced), or **Not available**.
- **Duplicate**, **Archive** and **Restore**. Built-in agents are read only; an
  update never overwrites your copy. Archiving stops new assignments only.
- **Recent work**: the agent's assignments and their state: **Preparing**,
  **Started**, **Couldn't start** or **Interrupted**.

### Usable as and the Worker picker

A custom agent's **Usable as** chooses where it can be used: **Main agent**
(Assign), **Worker** (the composer's Worker mode) and **Delegated task**.
Duplicate the built-in **Reviewer** and turn on **Main agent** to assign work to
it directly.

Custom agents usable as a Worker appear under **Custom agents** in the
composer's Worker menu. Picking one copies its instructions and tool list into
this task's Worker; edit the agent and pick it again to refresh the copy.
Picking a preset afterwards clears it.

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

The right rail's **Flow** panel shows one task: the assignment, each mission
stage with its state and evidence (verified by Stave or agent reported), and
the delegated tasks that branched off each stage. **Timeline** lists when a
node started, was asked for changes, retried and ended. The panel only reads
the records that already exist; it changes nothing.

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
- Agents cannot be exported back to agent files yet.
- Hooks, inline MCP servers and approval-skipping modes in agent files are
  never imported.
- A worktree is a separate checkout, not a sandbox.

## Related

- [Playbooks](playbooks.md) and [Missions](missions.md)
- [Delegated tasks](delegated-tasks.md)
- [Auto-routing](auto-routing.md)
- [Fleet Action Required](fleet-needs-me.md)
