# Agent Platform Taxonomy And Boundaries

Stave grew several ways to make an agent do more work — Advisor, Worker, Fleet,
Routines, the run ledger — and each was added for its own reason. This file
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

Lane names for workspace state are fixed and ordered:
`action-required` > `in-progress` > `in-review` > `idle`.

## Three Layers

Every concept belongs to exactly one layer, classified by scope (turn / task /
fleet) and lifetime (ephemeral / durable).

### Layer 1 — Turn runtime: help the current turn

Ephemeral, turn-scoped, minimal product branding. These are task options.

| Concept | Role | Does not |
| --- | --- | --- |
| Advisor | One read-only advice call before a turn, injected as context | Execute; persist |
| Worker | Same-provider delegation inside a turn | Survive a restart; cross providers |
| Utility inference | Mechanical meta calls: task name, route classification, commit message | Block the task; give advice |
| Work graph | The turn's fan-out as a tree: who is working, what waits on what | Execute; persist; outlive the turn |

Boundary: Advisor produces *content* the user would recognize as an opinion.
Utility inference produces *metadata* the user never argues with.

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
own workspace and run, steered through the child-task coordinator against the
frozen identity, so what the provider can do to its own in-process subagents
says nothing about it.

Both kinds of node live in one graph, and the delegating call is what joins
them: `stave_delegate_task` carries the delegation key in its own input, so the
child hangs off the agent that delegated it rather than floating at the turn
root. The graph is scoped to a turn, so the parent's full delegation history
stays with the child task list; only the children this turn delegated join its
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
| Task control plane | Identity (`projectPath + workspaceId + taskId + turnId`) and staleness validation for remote actions |
| Task execution summary | Provenance-tagged scorecard; missing data is never rendered as zero |
| Sidebar work queue | The same lane model as one of the sidebar's two views (`Projects` / `Work queue`) |
| Run ledger (run core) | Durable bookkeeping for delegated execution: runs, steps, receipts, idempotency, claims |

The run ledger is shared machinery, not a feature. Compare Judge is its first
client; durable child tasks are its second. Widen it for a new client instead of
building a second ledger beside it.

### Layer 3 — Continuity: keep going without me

Durable (SQLite), reconciled on restart, always carrying an explicit terminal
reason. Two axes:

| | Ephemeral | Durable |
| --- | --- | --- |
| Time — run again | — | Routine (new task per occurrence) / Heartbeat (same task, same session) |
| Delegation — hand work off | Worker (Layer 1) | Child tasks (cross-provider, normal tasks + ledger receipts) |

Routine is the only concept that lives outside a task: it mints tasks.
Everything else in this layer attaches to one existing task.

A child task is a real Stave task created on a parent's behalf, recorded on the
run ledger as a `child-task` run with a `task` origin (the parent's id) and one
`child-task-turn` step per delegated turn. The ledger holds the bookkeeping —
identity, phase, receipts, idempotency — while the normal task machinery creates
the task and runs its turns. The parent's context receives identity, phase and
reason; never the child's transcript. See
`docs/features/child-tasks.md`.

Child identity is the delegation link, and it is frozen: a child task carries
`parentTaskId`, and a delegation is named by `parentTaskId + delegationKey`. That
link is the single source of truth for both directions — the parent's child rows
and the child's backlink — and for keeping a child out of workspace-level
listings (`isDelegatedChildTask` in `src/lib/tasks.ts`). Anything built on top of
delegation keys off that link rather than re-deriving parentage its own way.

Because identity is frozen, it is also enforceable: every control the parent
offers on a child carries the identity its row was rendered against, and the
coordinator refuses the action with `stale-identity` when the delegation has
moved on. A control is never applied to whatever replaced the child it meant.

A heartbeat is a task supervisor entry: `src/lib/automation/task-supervisor.ts`
holds the policy, `electron/host-service/task-supervisor-runtime.ts` executes
it, and `task_heartbeats` / `task_heartbeat_occurrences` store it. Those are
deliberately not ledger tables, and the contrast with child tasks above is the
reason: the ledger records delegated execution, while a heartbeat records
wake-ups on a task the user already owns — no claim, no lease, no receipts.
See `docs/features/task-heartbeats.md`.

A heartbeat wakes on one of two triggers. A schedule walks a cadence; a
completion waits for a child-task run of the same parent to reach a terminal
status. The completion trigger is where the two rows above meet without
merging: the supervisor *reads* the ledger's terminal rows and writes only its
own occurrence rows, so the direction of that dependency — supervisor reads
ledger, never the reverse, and never through the coordinator — is what keeps
"records wake-ups" and "records delegated execution" separate concepts rather
than one table with two meanings.

## Boundary Statements

These are the statements that keep the layers from collapsing into each other.
Each one is registered in `config/reliability-gates.json` and asserted by a test
whose name repeats it.

1. A routine never wakes an existing task; its definition cannot target one.
2. A heartbeat never creates a task; it only adds a turn to one that exists.
3. A worker never survives a restart; a child task always does.
4. The ledger records and never executes; executors execute and never write
   ledger rows except through coordinator transitions.
5. Advisor advises content; utility inference computes metadata.
6. The work queue assigns a workspace to exactly one lane, in fixed priority
   order.
7. A work graph node names a worker, never a call; a call-derived node is never
   offered a per-agent control.

Every statement is now fully asserted; none is forward-looking any more. The two
that were written ahead of their capability landed inside the boundary rather
than beside it, which is what recording them early was for:

- Statement 2 is asserted from both sides: a routine definition cannot name a
  task, and a heartbeat definition must name one and cannot carry the fields
  that would let it mint a task.
- Statement 3 is asserted by recovery: a child task is reconciled against the
  live task after a restart rather than closed with the process, while a worker
  has no durable record to reconcile at all.

## Adding Something New

1. Name the layer it belongs to. If it seems to span two, it is two things.
2. Name its consumer. A module with no visible consumer does not ship — the run
   ledger spent a year with exactly one client because that rule did not exist.
3. Reuse the vocabulary above. A new synonym is a new concept to everyone
   reading the code later.
4. If it changes a boundary statement, change it here first, then the gate.
