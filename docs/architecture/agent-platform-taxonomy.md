# Agent Platform Taxonomy And Boundaries

Stave grew several ways to make an agent do more work — subagents, Fleet,
Automations, the run ledger — and each was added for its own reason. This file
fixes what each one is, what it is not, and which vocabulary the product uses,
so the next capability lands in the right layer instead of beside a similar one.

Read this before adding anything that runs work, schedules work, delegates
work, or shows work.

## Vocabulary

Use these words in code, UI copy, and plans. Do not introduce synonyms.

| Word | Means |
| --- | --- |
| Task | One conversation with one provider inside one workspace. The unit everything else attaches to. |
| Turn | One request/response cycle inside a task. Ends with exactly one terminal event. |
| Attention item | One thing that wants the user: a question, an approval, a failed run, a PR state. `FleetAttentionItem`. |
| Action required | The lane and inbox heading for blocking attention items. Replaces the older "Needs me". |
| Ledger | The durable runs/steps/receipts record in `src/lib/runs/`. It records; it never executes. |
| Receipt | One bounded record of how something started or ended. Never transcript text, never secrets. |
| Occurrence | One firing of a schedule. |
| Automation | A saved prompt and schedule that mints a new task per occurrence. Code, IPC channels and Local MCP tools say `automation`; the older word "routine" is retired. |
| Wake-up | A supervised turn added to an existing task on a schedule or when its delegated work finishes. Code, tables and Local MCP tools say `wakeUp` / `wake_up`; the older word "heartbeat" is retired for this feature. Provider and Crane "heartbeats" are unrelated. |
| Subagent | Any agent a task or agent calls, in the turn (a provider subagent compiled from the agent's `canCall`) or as a delegated task. The UI says Subagent for both; the retired Advisor and Worker were the in-turn kind. |
| Delegated task | A durable subagent: a Stave task created on another task's behalf, possibly on the other provider or in its own worktree, recorded on the run ledger. The relation stays parent/child (`parentTaskId`); the older words "child task" are retired. Run ids keep the persisted `child-task:<parent>:<key>` format. |
| Issue | A ticket from a connected tracker (Jira, Crane), listed on the Issues surface and started as a Stave task from there. Code: `TrackerIssue`. "Task" is reserved for Stave conversations; Crane's own API keeps calling its items tasks. |
| Repository | A registered folder that holds workspaces. Code: `repositoryPath`. The older word "project" is retired for it. |
| Workflow | An agent's ordered stages, each an AI stage with an instruction and a "Done when" condition or a Stave action. A run of the agent follows them; an agent without one runs one "Work" stage. It grants no permissions. Code: `AgentConfig.workflow`, validated with the stage schema in `src/lib/workflows/schema.ts`. |
| Stage | One step of a workflow: an AI stage (a turn with an instruction, optionally done by another agent) or a Stave action (open a draft PR, watch checks, mark ready, run a script), which Stave performs itself. |
| Check in with me | Where a run waits for the user's sign-off between stages: only when stuck (the agent default), before publishing, or every stage. Code: `AgentConfig.checkIns`, the engine's `CheckIns` (`when-stuck`, `plan-and-publishing`, `every-stage`). |
| Playbook | Retired as a user concept: a saved playbook became a custom agent with that workflow (converted by 0.22.0 and 0.23.0; 0.24.0 removed the conversion). Saved playbooks stay as read-only data: old runs started from them (legacy runs) still render. Playbook start conditions and proposed runs are removed. Code calls the run plan a `Workflow` (`agentRun.workflow`). |
| Sign-off | The user's approval before a stage starts. "Ask for changes" reruns the previous AI stage with feedback. |
| Agent run | Code word (`AgentRun`) for what users see as a **Run**: one run of a plan of stages on one lead task the user already owns — an agent's run (`origin: "agent"`) or a legacy run started from a playbook. Code: `src/lib/agent-runs/`. |
| Stage report | What the agent reports for a stage through `stave_report_stage` or `stave_block_stage`. Its evidence is "Verified by Stave" only when Stave saw the cited call succeed; otherwise "Agent reported". |
| Agent run report | The summary an agent run leaves when it ends: stages, decisions, evidence, links, and, for a partial run, what it left behind. |
| Project | Removed. It was a goal-level coordinator that started parallel agent runs. Its tables stay in the database unread, and each project's memories are exported once to `<user data>/exports/project-memory/<project id>.md`. Old agent runs a project started still render. Not a registered folder. |
| Agent | A saved worker definition: instructions, skills, a model choice, tool limits, a default permission and a workspace. Built-in, Custom, or From repository. It grants no permissions and starts nothing. Code: `AgentConfig` in `src/lib/agents/`, referenced as `agentConfigId` — never `agentId`, which names a provider worker on normalized events, and never `AgentDefinition`, the Claude Agent SDK's subagent type. |
| Agent role | Where an agent can be used: `primary` (Main agent of a task), `worker` (an in-turn subagent), `delegate` (a delegated task). The same words as the auto-routing roles. Code: `usableAs`. |
| Agent snapshot | The copy of an agent taken when work starts, with its content hash ("Version used"). Later edits never reach a run. |
| Assign | Handing work to an agent as a task's main agent. Kickoff creates the worktree (or, for an agent that works in the current workspace, a task there) and records the agent before the first turn, which is sent like any composer turn. Code: `AgentAssignment`, recorded by `assign-runtime.ts`. |

Lane names for workspace state are fixed and ordered:
`action-required` > `in-progress` > `in-review` > `idle`.

## Three Layers

Every concept belongs to exactly one layer, classified by scope (turn / task /
fleet) and lifetime (ephemeral / durable).

### Layer 1 — Turn runtime: help the current turn

Ephemeral, turn-scoped, minimal product branding. These are task options.

| Concept | Role | Does not |
| --- | --- | --- |
| In-turn subagent | A provider subagent the task's agent calls inside its turn, compiled from its `canCall` agents, under the lead's permissions, one level deep | Survive a restart; cross providers |
| Utility inference | Mechanical meta calls: task name, route classification, commit message | Block the task; give advice |
| Work graph | The turn's fan-out as a tree: who is working, what waits on what | Execute; persist; outlive the turn |

Boundary: a subagent produces *content* the caller reviews before relying on
it. Utility inference produces *metadata* the user never argues with. A second
opinion is a read-only delegated task: `stave_delegate_task` with
`access: "read-only"` waits for its answer and returns it inline.

The work graph is a *projection*, not a second executor. It reduces the same
normalized provider events the flat activity shelf reads, shares its
subagent-classification predicates (`src/lib/providers/subagent-identity.ts`) so
the two can never disagree about what counts as a subagent, and rides the turn's
activity snapshot so both are started and discarded together. It holds no state
the turn does not already have.

A node is only ever keyed from something that names a *worker*: the delegation
key where Stave owns the child on the run ledger, or provider identity where the
runtime owns it. A delegating call the provider never attributed still appears —
a flat fan-out is better than a blank surface — but it is marked as
call-derived and is refused every per-agent control, because a tool-use id
identifies one call and a Stop aimed at it would either miss or end the whole
turn. Per-agent message, interrupt, and stop over a *provider-owned* agent are
gated on `ProviderRuntimeCapabilities.workGraph`; no runtime declares them
today, which is why they are declared capabilities rather than assumptions. A
*ledger-owned* child is not gated on them at all: it is a Stave task with its
own workspace and run, steered through the delegated-task coordinator against the
frozen identity, so what the provider can do to its own in-process subagents
says nothing about it.

Both kinds of node live in one graph, and the delegating call is what joins
them: `stave_delegate_task` carries the delegation key in its own input, so the
child hangs off the agent that delegated it rather than floating at the turn
root. The graph is scoped to a turn, so the parent's full delegation history
stays with the delegated task list; only the children this turn delegated join its
fan-out.

Two provider fields answer "which agent" and mean opposite things, so they are
carried separately on the normalized event and must never be merged: `agentId`
points *down* to an agent a call spawned, `ownerAgentId` points *up* to the agent
the event was emitted from. Collapsing them inverts a spawn edge.

A runtime may report the two out of order — Claude names the spawning call
first and the worker behind it only on a later progress message. The node is
then rekeyed onto the identity rather than joined by a second node, because the
half that would stay visible is the call, which is the half no control may
target. A correlation the runtime only guessed at (Claude's positional
fallback) crosses the event boundary marked `binding: "guess"` and may route
progress text to a row, but never creates or overwrites a spawn↔identity
binding — a laundered guess would cross-wire two concurrent workers for the
rest of the turn.

`ownerAgentId` also travels on the prompts a person has to answer, exactly as
far as the runtimes report an owner: Claude attaches it to approvals and to
`AskUserQuestion` user-input raised inside a subagent (its permission callback
is the only prompt path that carries the sub-agent id; MCP elicitations and
user dialogs report none). Codex has no owner concept on prompts, so its
approval and user-input events never carry it and a Codex prompt blocks the
turn root. Where the id is present, a fan-out where one worker is waiting on a
person does not read as one where all of them are.

### Layer 2 — Supervision: see everything, intervene from anywhere

Fleet-scoped, read plus control, no new execution semantics.

| Concept | Role |
| --- | --- |
| Fleet | The cross-workspace surface: attention inbox, workspace cards, task control |
| Task control plane | Identity (`repositoryPath + workspaceId + taskId + turnId`) and staleness validation for remote actions |
| Task execution summary | Provenance-tagged scorecard; missing data is never rendered as zero |
| Sidebar work queue | The same lane model as one of the sidebar's two views (`Repositories` / `Work queue`) |
| Run ledger (run core) | Durable bookkeeping for delegated execution: runs, steps, receipts, idempotency, claims |

The run ledger is shared machinery, not a feature. Compare Judge is its first
client; durable delegated tasks are its second. Widen it for a new client instead of
building a second ledger beside it.

### Layer 3 — Continuity: keep going without me

Durable (SQLite), reconciled on restart, always carrying an explicit terminal
reason. Two axes:

| | Ephemeral | Durable |
| --- | --- | --- |
| Time — run again | — | Automation (new task per occurrence) / Wake-up (same task, same session) |
| Delegation — hand work off | In-turn subagent (Layer 1) | Delegated tasks (cross-provider, normal tasks + ledger receipts) |
| Procedure — follow a workflow | — | Agent run (same task, the agent's ordered stages, check-ins) |

Automation is the only concept that lives outside a task: it mints tasks.
Everything else in this layer attaches to one existing task.

A delegated task is a real Stave task created on a parent's behalf, recorded on the
run ledger as a `delegated-task` run with a `task` origin (the parent's id) and one
`delegated-task-turn` step per delegated turn. The ledger holds the bookkeeping —
identity, phase, receipts, idempotency — while the normal task machinery creates
the task and runs its turns. The parent's context receives identity, phase and
reason; never the child's transcript. See
`docs/features/delegated-tasks.md`.

Child identity is the delegation link, and it is frozen: a delegated task carries
`parentTaskId`, and a delegation is named by `parentTaskId + delegationKey`. That
link is the single source of truth for both directions — the parent's child rows
and the child's backlink — and for keeping a child out of workspace-level
listings (`isDelegatedTask` in `src/lib/tasks.ts`). Anything built on top of
delegation keys off that link rather than re-deriving parentage its own way.

Because identity is frozen, it is also enforceable: every control the parent
offers on a child carries the identity its row was rendered against, and the
coordinator refuses the action with `stale-identity` when the delegation has
moved on. A control is never applied to whatever replaced the child it meant.

A wake-up is a supervisor entry: `src/lib/supervision/wake-up-policy.ts`
holds the policy, `electron/host-service/wake-up-runtime.ts` executes
it, and `wake_ups` / `wake_up_occurrences` store it. Those are
deliberately not ledger tables, and the contrast with delegated tasks above is the
reason: the ledger records delegated execution, while a wake-up records
wake-ups on a task the user already owns — no claim, no lease, no receipts.
See `docs/features/wake-ups.md`.

A wake-up fires on one of two triggers. A schedule walks a cadence; a
completion waits for a delegated-task run of the same parent to reach a terminal
status. The completion trigger is where the two rows above meet without
merging: the supervisor *reads* the ledger's terminal rows and writes only its
own occurrence rows, so the direction of that dependency — supervisor reads
ledger, never the reverse, and never through the coordinator — is what keeps
"records wake-ups" and "records delegated execution" separate concepts rather
than one table with two meanings.

An agent run is the second supervisor entry. `src/lib/agent-runs/policy.ts` holds
its pure decision order, `electron/persistence/agent-run-store.ts` stores it in
`agent_runs` / `agent_run_stages` / `agent_run_events`, and
`electron/host-service/supervision/agent-run-runtime.ts` executes it beside the
wake-up runtime, starting turns through the same `runSupervisedTurn` path under
the same safety rules. Like a wake-up it adds turns to one existing task and
records no claims, leases or receipts; it *reads* delegated-task completions and
PR checks and writes only its own rows. It never completes a stage because a
turn ended: only the agent's stage report, or the result of a Stave action
Stave performed itself, completes one. The agent reports through Local MCP
tools that exist only under the turn's agent run grant, which names the stage
attempt, so a report cannot name another stage.

Wake-ups and agent runs share one rule, owned by
`src/lib/supervision/automatic-turn-owner.ts`: a task has at most one source of
automatic turns. While an agent run is running or paused, the task's wake-up
pauses with `agent-run-active` and resumes on its own when the agent run ends, and
a new wake-up on that task is refused.

## Boundary Statements

These are the statements that keep the layers from collapsing into each other.
Each one is registered in `config/reliability-gates.json` and asserted by a test
whose name repeats it.

1. An automation never wakes an existing task; its definition cannot target one.
2. A wake-up never creates a task; it only adds a turn to one that exists.
3. An in-turn subagent never survives a restart; a delegated task always does.
4. The ledger records and never executes; executors execute and never write
   ledger rows except through coordinator transitions.
5. A subagent returns content its caller reviews; utility inference computes
   metadata.
6. The work queue assigns a workspace to exactly one lane, in fixed priority
   order.
7. A work graph node names a worker, never a call; a call-derived node is never
   offered a per-agent control.
8. An agent run advances exactly one lead task and never creates a task.
9. A stage completes only through a recorded stage report or a Stave action
   result; an ended turn alone never completes a stage.
10. A saved agent or saved workflow never grants permissions; every run start records
    its own consent.
11. At most one supervisor entry starts automatic turns on a task at a time.
12. A saved agent grants no permissions; every start records its own consent.
13. Saving or editing an agent never creates a workspace, a task or a process.
14. A run follows the snapshot taken at its start; later edits never reach it.
15. Work for an agent starts only through Kickoff or a delegation, and is
    recorded before its first turn; a delegation to an agent never runs wider
    than the delegating task's own agent, and work pinned to a commit never
    starts on another.
16. An agent run's lead task keeps its provider and instructions for the whole
    agent run; a stage another agent does runs as a delegated task of it.
17. A Local MCP call acts only for the task whose turn made it: the host's
    caller grant names that task, a `parentTaskId` naming another is refused,
    a subagent never starts subagents of its own, and a turn started through
    `stave_run_task` never runs with more autonomy than its caller.
18. Writers never share a checkout: a writing subagent runs in its own
    worktree unless one is asked for explicitly, and then only while no other
    writing subagent is live there; read-only subagents run beside anything.

Statement 12 is asserted per turn: an agent's permission is a ceiling that
lowers the turn's own settings and never raises them (`src/lib/agents/permission.ts`),
applied at the provider turn entry for every turn of an assigned task.
Statement 12 also covers agents read from repository files: a file can only
narrow the default permission it is read with, and it never takes the id of a
custom or built-in agent, so a cloned repository cannot change what an agent
the user already trusts is told.

Statement 10 is asserted at the run start (`src/lib/agent-runs/agent-run.ts`):
the run records the user's own permission settings and the agent's check-ins,
its turns take permissions from that consent only, and a publish or Stave
action stage is authorized at start only when the agent checks in only when
stuck. Every statement is fully
asserted. The two statements that were earlier written ahead of their
capability landed inside the boundary rather than beside it, which is what
recording them early was for:

- Statement 2 is asserted from both sides: an automation definition cannot name a
  task, and a wake-up definition must name one and cannot carry the fields
  that would let it mint a task.
- Statement 3 is asserted by recovery: a delegated task is reconciled against the
  live task after a restart rather than closed with the process, while an
  in-turn subagent has no durable record to reconcile at all.

## Adding Something New

1. Name the layer it belongs to. If it seems to span two, it is two things.
2. Name its consumer. A module with no visible consumer does not ship — the run
   ledger spent a year with exactly one client because that rule did not exist.
3. Reuse the vocabulary above. A new synonym is a new concept to everyone
   reading the code later.
4. If it changes a boundary statement, change it here first, then the gate.
