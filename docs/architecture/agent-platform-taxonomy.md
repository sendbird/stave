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

Boundary: Advisor produces *content* the user would recognize as an opinion.
Utility inference produces *metadata* the user never argues with.

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
client; durable child tasks are planned as its second. Widen it for a new
client instead of building a second ledger beside it.

### Layer 3 — Continuity: keep going without me

Durable (SQLite), reconciled on restart, always carrying an explicit terminal
reason. Two axes:

| | Ephemeral | Durable |
| --- | --- | --- |
| Time — run again | — | Routine (new task per occurrence) / Heartbeat (same task, same session) |
| Delegation — hand work off | Worker (Layer 1) | Child tasks (cross-provider, normal tasks + ledger receipts) — planned |

Routine is the only concept that lives outside a task: it mints tasks.
Everything else in this layer attaches to one existing task.

A heartbeat is a task supervisor entry: `src/lib/automation/task-supervisor.ts`
holds the policy, `electron/host-service/task-supervisor-runtime.ts` executes
it, and `task_heartbeats` / `task_heartbeat_occurrences` store it. Those are
deliberately not ledger tables — the ledger records delegated execution, a
heartbeat records wake-ups on a task the user already owns.

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

Statement 3 is partly forward-looking: child tasks are not built yet. It is
recorded here so the capability lands inside the boundary rather than beside it,
and the gate test asserts the half that exists today.

Statement 2 is now asserted from both sides: a routine definition cannot name a
task, and a heartbeat definition must name one and cannot carry the fields that
would let it mint a task.

## Adding Something New

1. Name the layer it belongs to. If it seems to span two, it is two things.
2. Name its consumer. A module with no visible consumer does not ship — the run
   ledger spent a year with exactly one client because that rule did not exist.
3. Reuse the vocabulary above. A new synonym is a new concept to everyone
   reading the code later.
4. If it changes a boundary statement, change it here first, then the gate.
