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
| Permission | Read only, Manual, Guided, Auto | A default only; a read-only agent works in the current workspace |
| Model | Auto-routing, or a fixed provider and model | Auto-routing uses your routing rules for the agent's task class |
| Usable as | Main agent, Worker, Delegated task | Built-in Worker presets are usable only as a Worker |

## Behavior Details

- Assigning twice from the same click starts the work once.
- If Stave stops while preparing, the assignment shows **Interrupted** with
  what it had made. It is never started again on its own.
- Cursor and Kiro receive the agent's instructions at the top of the first
  message; Claude and Codex receive them on their instruction channel.
- Tool limits are enforced where the provider supports them (for example, a
  Claude main agent's denied tools) and stated in the instructions elsewhere.

## Limitations

- Agent files in a repository can be read and converted, but the Agents tab
  does not list them yet.
- Hooks, inline MCP servers and approval-skipping modes in agent files are
  never imported.
- A worktree is a separate checkout, not a sandbox.

## Related

- [Playbooks](playbooks.md) and [Missions](missions.md)
- [Delegated tasks](delegated-tasks.md)
- [Auto-routing](auto-routing.md)
- [Fleet Action Required](fleet-needs-me.md)
