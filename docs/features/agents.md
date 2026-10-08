# Agents

## Summary

An agent is who runs a task: its instructions, how it picks a model, the tools
it may use, whether it is read only, and where it works. Assign work to an agent
and Stave makes the task — in a new worktree or in the current workspace — and
starts it. Every later turn of that task runs as the same version of the agent.
An agent can also be a **subagent**: an agent another agent calls for one
piece of its work, inside its turn or as a delegated task.

Saving an agent starts nothing and grants nothing. Each assignment records its
own start. A task that runs as an Agent runs **autonomously**: no routine
approval prompts, only the guardrails (all on by default, each one can be turned off). A read-only Agent stays read
only. Delegated Agents use the delegation policy resolved by the host and never
get more autonomy than the task that delegated them.

**Run overview → Run details** shows the Agent version captured for that turn,
the permission source and whether instruction delivery was confirmed. The run's
model remains the provider's reported model. Older turns without Agent evidence
stay unspecified. History marks a saved version **Assigned** when an assignment
references it; that label does not count completed turns.

## When To Use It

- You keep explaining the same role to a model: "review this commit, change
  nothing", "implement in a fresh worktree and verify".
- You want the same role on Claude, Codex, Cursor or Kiro without rewriting it.
- Your repository already has agent files for a coding agent and you want to
  use them from Stave.

For a sequence of stages, give the agent a [workflow](#workflow). For a
one-off prompt, use a macro.

## Quick Start

Open the **Agents** surface from the sidebar, the command palette
(`Open Agents`), or `Cmd/Ctrl+K` then `G`. It has three tabs: **Agents**,
**My standards** and **Performance**, which compares ended agent runs across
workspaces (see [Agent performance and task outputs](results.md)).

1. Open **Agents** in the sidebar and stay on the **Agents** tab.
2. Press **New agent** and say what it should do in one line, then **Draft
   agent**. Review the draft in the editor and save it. You can also start
   blank or copy an existing agent, or **Duplicate** any agent to edit a copy.
3. Press **Assign…** in the agent's header. Kickoff opens with the agent
   preselected as the worker.
4. Describe the work as the kickoff source, then **Assign** (or leave the
   first task ready without starting).
5. **Open task** to follow it. The task's **Flow** panel shows what was
   assigned, its stages and the tasks it delegated.

### Other ways to start work with an agent

- **Issues**: a ticket's context menu, or the detail pane's ⋯ menu, has
  **Assign to agent**. The ticket's key, title and link become the kickoff
  source. The ticket's own assignee does not change.
- **Composer**: type `!assign` in any task's composer, including a new one. The
  rest of the draft becomes the kickoff source. The agent works in its own task.
- **Command palette**: **Assign to an agent…** opens the composer's selector
  on **Agents** when a task is open, and Kickoff otherwise.

All of these open **Kickoff** with **Who** set. On the first screen, choose
**Me** or an agent; with an agent, **Assign** starts the work right away,
from the source as **Skip AI** reads it. On the review screen, **Who** and
**Where** set the worker and the new worktree and its base; the agent's
workflow decides the stages.

**Assign** on either screen is the same start; the first one only skips the
review. **Where** starts on **New workspace** for every agent, including Lead.
Choose **Current workspace** to add a new task where you are, with no worktree.
This kickoff choice is independent of the agent's saved workspace preference,
which still applies to delegation. Selecting the same agent for another kickoff
creates a separate assigned task; it does not reuse or replace its existing task. The task records its agent, then its first turn is
sent like any composer turn: your sandbox, deny lists, credential lists,
network setting, trusted tools and Stave Auto apply, and the turn runs
autonomously, exactly like every later turn. Kickoff shows where it runs as
**Agent settings: provider · model · permission**.

## Interface Walkthrough

### Agents tab

- **Custom**, **From repository** and **Built-in** agents, with search. Each row
  shows an avatar — an initials disc in the agent's colour. Drag the list's
  edge to make it wider or narrower (240–480px, never so wide the detail drops
  under 512px); double-click the edge to return to the default 288px. Stave
  keeps the width between sessions.
- **New agent**: describe the job in **What should it do?** and press **Draft
  agent**. The **Utility inference** model (Settings → Background AI) drafts
  the name, **Use when**, instructions, permission, where it works and a
  colour; a reviewer or researcher is kept read only. The editor opens with the
  draft. **Start blank** (Auto model, Auto permission, a new worktree, usable as
  a main agent) and **Or copy an existing agent** (any built-in or repository
  agent) skip the model. Nothing is saved until you save the editor; **Cancel**
  discards the draft. The command palette's **New agent** and the empty state
  open the same dialog.
- **Profile header**: the avatar, the name, **Use when**, and chips for source,
  model, permission and where the agent works.
- **As a main agent**: per provider, whether the instructions and tool limits
  are **Enforced**, **Asked in instructions** (stated to the model, not
  enforced), or **Not available**.
- **Duplicate**, **Archive**, **Restore** and **Delete**. Built-in and
  repository agents are read only; an update never overwrites your copy.
  Archiving stops new assignments only.
- **Activity**, under the header: how many assignments the agent has, how
  many of its tasks are running or need you, how many couldn't start, when it
  was last used, and **Work** — its assignments with their state (**Preparing**,
  **Started**, **Couldn't start** or **Interrupted**) and a filter. While the
  agent runs a task (or for half an hour after the run ends) the row shows the
  run's state and where it stands (`Cause 2/3`, or `Plan 3/5` for a one-stage
  run); click a row to open its task.
- **Settings** and **History** tabs. History is covered below.

### Editing an agent

A custom agent's editor shows what most agents need and keeps the rest out of
the way:

- **Profile**: name, colour and **Use when**.
- **Instructions**: what the agent does on every task.
- **Workflow**: the stages its runs follow (see below).
- **How it runs**: the model (**Auto-routing** with an optional task class, or
  a **Fixed** provider, pinned model and effort), the permission, and where it
  works.
- **Advanced** (collapsed): **Don't use when**, skills, allowed and denied
  tools, max turns, concurrency, what it is usable as, and its report sections.

A field that fails a rule shows the reason inline (for example, a read-only
agent cannot take a new worktree, and a tool cannot be both allowed and denied).
A save blocked by an **Advanced** field opens **Advanced**.

### History

Every save that changes how a custom agent behaves keeps the version it
replaced; the last 10 are listed newest first. Each row names the fields that
differ from the agent now and shows **Ran** when a task used that exact
version. **Restore** saves the old version as the current agent, so the version
it replaces joins History and a restore can itself be undone. Archiving and
concurrency changes are not new versions.

### Learned suggestions

When you correct a custom agent in one of its tasks (you write again after it
answered), Stave asks the **Utility inference** model once whether the agent's
instructions should change so the correction is not needed next time. If so,
a suggestion appears on the agent's page with the change in one sentence:

- **Apply** saves the suggested instructions like an edit, so the previous
  instructions stay in History.
- **Edit** lets you change the suggested instructions before applying them.
- **Dismiss** drops the suggestion.

Learning is on for new custom agents; turn **Learn from my corrections** off
on an agent's page to stop it. Each corrected task uses at most one request,
and an agent keeps at most three open suggestions. Only the task's messages
from you and the agent are sent — no tool output, attachments or secrets — and
the request runs read only. A suggestion written against instructions you have
since changed says so; applying it replaces them. Built-in and repository
agents do not learn.

### Workflow

An agent's **Workflow** is the ordered stages a run of it follows. Without
stages, a run is one stage that plans its own steps — Implementer, Researcher,
Reviewer and Lead work this way. Debugger (Reproduce → Cause → Fix), UI
Polisher (Reproduce → Fix → Report) and Shipper (Validate → Open draft PR →
Watch checks → Ready for review) come with a workflow.

- **Add stage**: an AI stage (blank or from a template) with an instruction
  and **Done when**, optionally done by another agent and pinned to a commit;
  or a Stave action: **Open draft PR**, **Watch checks**, **Ready for review**
  or **Run script**. Drag a stage, or use Alt+arrow keys, to reorder it.
- **Check in with me** (with two or more stages): **Only when stuck**
  (default), **Before publishing** or **Every stage**. A stage's hand toggle
  makes that one stage ask, or not.
- Each AI stage reports when it is done; the run card and the Task panel's
  **Progress** show the stages only when there is more than one.
- When the agent helps another agent (a subagent or a delegated task), its AI
  stages are written into its instructions as an ordered list.
- Exported agent files leave the workflow out and say so.

### Deleting an agent

**Delete** removes a custom agent from your settings, with its History and
suggestions. Past assignments keep
their own snapshot, so an agent's history still shows its name after it is gone.
If another agent's workflow stage still names the agent, deletion is blocked and
the dialog lists where — **Archive instead**, or remove those references first.
Running or waiting tasks are shown for context but do not block: they keep the
version they started with and finish on their own.

### Avatars elsewhere

An agent's avatar also appears next to its work in the sidebar (with a status
dot — a green dot for running, an amber dot when it needs you), in the Kickoff
**Who** picker, on the Fleet task badge, and on the assignment node of a task's
**Flow** panel. Built-in and repository agents get a stable colour derived from
their id; a custom agent's colour is chosen in its **Profile** section.

### Models and agents in the composer

The composer's selector (`Alt+P`) always has two sections and one search box:
**Models** (the providers and Stave Auto) and **Agents** (every active agent
that can run a task). Typing in the search also lists the agents that match.
What you pick decides how the task runs:

- **A model is Chat.** The model runs the task with the task's own permissions,
  as it always did. If an agent was running the task, picking a model ends it
  and its run. Later turns tell the model the agent was released and its role
  and limits no longer apply (Claude's system prompt, Codex's developer
  instructions, once per session in the prompt on Cursor and Kiro), because a
  resumed session still remembers the agent's instructions.
- **An agent is Agent mode.** The agent runs the task from the next turn and
  picks its own model: Stave Auto routes every turn, using the agent's task
  class as its starting point. An agent with a fixed model uses it as its
  default instead. The selector does not move to a model. With Stave Auto
  turned off, the agent runs on the model the task already has.
- **A pin binds the agent's turns to one model.** In Agent mode the button
  has two segments, the agent and its model: `Implementer | Auto · Balanced`.
  While Stave Auto routes the agent's turns, the segment shows no effort (Auto
  chooses it on every turn) and opens on **Stave Auto**, where the preference
  (Balanced, Cost-saver, Quality-first) changes without ending the agent. Each
  provider tab is headed **Auto — Implementer chooses** (checked). Pick a
  model there and the segment reads **Pinned · Opus 5** with its effort; the
  first row becomes **Back to Auto**, and picking a preference on the Stave
  Auto tab also lifts the pin. A pin never ends the agent. Per turn the order
  is: pin, then the agent's fixed model, then Stave Auto. An agent fixed to a
  provider without a model runs on that provider's default model; any other
  model of the provider is a pin.
- The first send in Agent mode reads **Assign**; later sends read **Send**.
- A choice applies from the next turn. Earlier turns keep the agent they ran
  as, and each agent's History counts the turns it ran. Choosing another
  agent is locked while a turn runs or waits for an answer, and a switch to an
  agent with a wider permission asks first. Switching agents ends the run the
  previous agent started.
- A task that runs as an agent calls other agents itself, as subagents.

### Usable as

A custom agent's **Usable as** chooses where it can be used: **Main agent**
(Assign / Kickoff), **Subagent in a turn** (called inside a lead agent's
turn) and **Subagent as a task** (a delegated task). Duplicate the built-in
**Reviewer** and turn on **Main agent** to start work with it directly.

Every turn of a task that runs as an agent registers the agents it may call
as its in-turn subagents: its **Can call** list, or every agent usable as a
subagent in a turn when the list is open, at most eight. Claude calls them with
the Agent tool, under the lead's permissions; Codex starts them with
`spawn_agent` from the instructions Stave hands it. Either way they run one
level deep and their answers come back into the turn.

### Can call

**Can call**, under Advanced, limits which agents a task running as this agent
may delegate to. **Any agent** (the default) sets no limit. **Only these
agents** offers every active agent usable as a delegated task; checking none
means the agent delegates to no one. A delegation to an agent outside the list
is refused with the names it may call. Exported agent files leave **Can call**
out.

### My standards

**My standards**, its own tab on the Agents surface, holds your own rules for
every agent you run — how you want code written, reviewed or reported. Turned
on, they are added after each agent's instructions when you assign work,
delegate to an agent or it runs as a subagent. A task keeps the standards it
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

### Flow

The **Progress** tab of the right rail's Task panel shows one task's flow while
the task has no [agent run](agent-runs.md); once it has one, the agent run takes that
place. Every task has a base flow, drawn from records that already exist:

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

When a task is assigned to an agent, the **assignment** heads the flow, and the
task's delegated tasks follow the base steps as nodes of their own.
**Timeline** lists when a node started, was asked for changes, retried and
ended. The flow only reads the records that already exist; it changes nothing.

For a task assigned to an agent, **What it received** lists the version of the
agent the task runs (a short content hash), each instruction source that went
in, and how firmly the instructions, tool limits, model and permission are held
on that provider. If the agent was edited after the task started, the flow
says so: later turns keep the version used, and assigning again uses the edit.

### Fleet

A task that runs as an agent shows the agent's name, and typing the name in
Fleet's search finds its tasks.

## Configuration

| Setting | Values | Notes |
| --- | --- | --- |
| Works in | New worktree, Current workspace | New worktree uses Kickoff's branch (Assign on the first screen takes the one Skip AI proposes); Current workspace adds a task where you are |
| Permission | Read only, or full access (saved as Manual, Guided or Auto) | Read only keeps every turn in the read-only posture and works in the current workspace; any other value runs autonomously |
| Model | Auto-routing, or a fixed provider, model and effort | With Stave Auto on, the task stays on Auto and every turn is routed, with the agent's task class as the fallback; with it off, your routing rules pick one model and effort for the task when it starts |
| Usable as | Main agent, Subagent in a turn, Subagent as a task | Built-in subagents (Scout, Sweep, …) are usable only in a turn |

## Behavior Details

- The task and its prompt are saved, and the agent recorded, before the first
  send. If the send cannot start, the prompt stays ready in the composer; if
  it cannot be confirmed, check the task before sending again. Kickoff never
  sends twice on its own.
- Assignments from earlier versions that were cut off while preparing show
  **Interrupted** with what they had made. They are never started again on
  their own.
- Cursor and Kiro receive the agent's instructions at the top of the first
  message — or of the next message after the task starts as, or switches to,
  an agent from Kickoff, an agent run or the composer. Claude and Codex receive
  them on their instruction channel with every turn.
- A task that runs as an Agent is autonomous. Every turn of the task — the
  first and each later one — removes routine approval prompts and changes
  nothing else: your sandbox, deny lists, credential lists and network setting
  stay as you set them. Saved **Manual** and **Guided** agents now run like
  **Auto**; only **Read only** limits a turn.

  | Agent | Claude | Codex | Cursor | Kiro |
  | --- | --- | --- | --- | --- |
  | Read only | Don't Ask, edit tools off, read-only sandbox | Read-only files, never asks, network off | Ask mode, Manual | Manual, told not to edit |
  | Any other | Native Auto (Bypass, Plan and Don't Ask stay as you chose); Stave answers what Claude still hands over | Never asks; at least workspace files, or your full access | Your settings | Your settings |

  The only interrupts left are the Agent-mode guardrails (all on by default;
  turn each off in Settings) — a write outside the task's repository, a protected credential path or variable, an irreversible
  remote action (force-pushing a default or protected branch, deleting remote
  branches, tags, releases or repositories, publishing, `sudo`) — and the
  agent's own questions. See
  [Provider Sandbox And Approval](./provider-sandbox-and-approval.md#autonomy-and-guardrails).
  Kiro has no read-only mode, so a read-only agent there asks before every tool
  and is only told not to edit; the Agents tab shows this as **Asked in
  instructions**.
  Read only covers the repository, not Stave's own records of the work: a
  read-only agent can still add workspace notes, todos, links and custom
  fields, write a plan file with `stave_write_plan_file`, and report or block
  its stage. Clearing or removing what you wrote, repository memory and
  schedules stay off.
- Tool limits are enforced where the provider supports them (for example, a
  Claude main agent's denied tools) and stated in the instructions elsewhere.
- Where an assigned task runs:

  | Agent model | Runs on override | Stave Auto | First turn and later turns |
  | --- | --- | --- | --- |
  | Fixed | — | either | The agent's provider, model and effort |
  | Auto-routing | A provider | either | Your model for that provider, never re-routed |
  | Auto-routing | Auto-routing | On | Auto, routed on every turn |
  | Auto-routing | Auto-routing | Off | One route from your rules for the agent's task class, kept for the task |

  When Auto routes the task, a confident classification decides the task
  class. The agent's task class fills in when the intent is unclear or
  classification is unavailable, and a safety escalation always wins.

## Limitations

- Stave reads at most 50 agent files per repository.
- Export writes Claude and Codex agent files only.
- Hooks, inline MCP servers and approval-skipping modes in agent files are
  never imported.
- A worktree is a separate checkout, not a sandbox.
- Running tasks as agents is experimental.

## Related

- [Agent runs and their stages](agent-runs.md) and [Playbooks (retired)](playbooks.md)
- [Delegated tasks](delegated-tasks.md)
- [Auto-routing](auto-routing.md)
- [Fleet Action Required](fleet-needs-me.md)

Agent instructions for a prompt-channel provider stay pending when the first
turn is blocked, cancelled before execution, or fails during provider startup.
They are included in both the plain prompt and canonical conversation input,
and consumed after the primary provider responds or starts a tool or decision.
A delayed turn cannot consume instructions recorded for a newer agent.
