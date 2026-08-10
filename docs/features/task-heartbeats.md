# Task Heartbeats

A heartbeat wakes one existing task on a schedule, in the same provider session.
It is the "keep going without me" answer for work that is already underway —
re-check CI on this PR every ten minutes, re-read this dashboard every hour —
as opposed to a routine, which mints a brand new task per occurrence.

The boundary between the two is fixed in
[Agent Platform Taxonomy](../architecture/agent-platform-taxonomy.md): **a
routine never wakes an existing task, and a heartbeat never creates one.**

## What it adds over `runTask`

`runTask(taskId)` could already add a turn to an existing task. Everything a
heartbeat adds is safety around doing that unattended:

| Situation | What happens |
| --- | --- |
| The user is mid-turn | The occurrence **defers**. It is not consumed, so it fires as soon as the task is free. |
| The task is waiting on an approval or a question | **Pause**, `awaiting-approval` / `awaiting-user-input`. Resumes itself once answered. |
| The task's provider or model changed | **Pause**, `runtime-changed`. Only an update clears it — the user has to agree to the new runtime. |
| The task moved, or the fleet control plane rejects its identity | **Pause**, `task-identity-changed`. |
| The task was archived or deleted | **Stop**, `task-unavailable`. |
| The expiry passed, or the next instant would fall past it | **Stop**, `expired`. |
| The occurrence cap was reached | **Stop**, `occurrence-cap-reached`. |
| Stave was closed across several instants | **Catch up once.** The latest instant fires; earlier ones are recorded as skipped. |
| The same instant is delivered twice | The occurrence's idempotency key makes the second a no-op. |

Paused and stopped states always carry a reason. A stopped heartbeat is
terminal: resuming it is refused, because resuming would silently ignore the
reason it stopped. Add a new one instead.

## Priority order

The policy is a single ordered decision, in
[`src/lib/automation/task-supervisor.ts`](../../src/lib/automation/task-supervisor.ts):

1. Terminal conditions (task gone, archived, expired, capped) — **stop**
2. Blocking conditions (identity, runtime, approval, question) — **pause**
3. Nothing blocking and the pause was automatic — **resume**
4. Not due yet — idle
5. Due, but a turn is running — **defer**
6. Due and free — **fire**

Stop beats pause, pause beats defer, defer beats fire. A user's turn always
wins.

## Schedules

Heartbeats reuse the routine schedule vocabulary — `{ every, unit, at?,
weekday?, weekdays? }` and `computeNextRoutineRunAt` from
[`src/lib/routines.ts`](../../src/lib/routines.ts) — so there is one cadence
model across the product and anchored day/week schedules keep their local
wall-clock time across DST.

The trigger is a discriminated union. `{ kind: "schedule" }` is implemented;
`{ kind: "completion" }` is a designed slot that the runtime refuses to create
until its executor lands with child tasks.

## Occurrences

Every firing, deferral, and skip is recorded with an idempotency key of
`<heartbeatId>:<outcome>:<scheduledFor>`. A unique index on
`(heartbeat_id, idempotency_key)` turns a duplicate delivery into a no-op, and
it means repeated deferrals of one instant collapse into a single row rather
than one per tick.

Occurrence history is pruned to the most recent 100 per heartbeat.

## Files

- [`src/lib/automation/task-supervisor.ts`](../../src/lib/automation/task-supervisor.ts) — schemas, catch-up walk, decision policy, transitions. Pure.
- [`electron/host-service/task-supervisor-runtime.ts`](../../electron/host-service/task-supervisor-runtime.ts) — the tick, the serialized operation chain, the boot sweep.
- [`electron/persistence/task-heartbeat-store.ts`](../../electron/persistence/task-heartbeat-store.ts) — `task_heartbeats`, `task_heartbeat_occurrences`.
- [`electron/host-service/local-mcp-runtime.ts`](../../electron/host-service/local-mcp-runtime.ts) — `getTaskSupervisionSnapshot`, `runHeartbeatTurn`.
- [`electron/main/task-supervisor-service.ts`](../../electron/main/task-supervisor-service.ts) — the main-process bridge.

## MCP tools

- `stave_list_task_heartbeats` — optionally scoped to a workspace
- `stave_get_task_heartbeat` — one heartbeat plus recent occurrences and their reasons
- `stave_create_task_heartbeat` — requires an existing `taskId`
- `stave_update_task_heartbeat` — also re-accepts the task's current runtime
- `stave_set_task_heartbeat_paused` — pause or resume
- `stave_remove_task_heartbeat` — deletes the heartbeat and its history

## Surfaces

State reaches the UI through the **shared task execution summary**, not a card
model of its own. `TaskExecutionSummary` carries a `supervision` metric —
`{ state, reason, nextRunAt, occurrenceCount, skippedCount }`, or `unavailable`
when no heartbeat is attached, never a zero and never a fake "idle". Because it
is one more metric, it reaches Fleet, the in-task Turn Activity shelf, and
completion-notification provenance without any of them being taught about
heartbeats.

The sidebar work queue reads it as a **signal**, not a lane: a paused heartbeat
joins `action-required` (only a human can restart it), and a scheduled one reads
`in-progress` rather than sinking to `idle`, where a supervised task would look
identical to a workspace nobody has touched. A stopped heartbeat contributes
nothing — it already ran its course, and its reason lives in the summary. The
four lanes and their order are unchanged.

Controls live in the per-task control panel, beside the existing approve /
steer / queue / stop gestures: add (a standing instruction plus a cadence drawn
from the routine presets), pause, resume, and remove. When a heartbeat is
paused or stopped, its reason is shown — that sentence is the point of the
feature.

Summaries are polled once at app level on the same 15s period as the host tick
and shared by both surfaces, rather than fetched per component.

## Storage

Two tables, not ledger tables. The run ledger records delegated execution; a
heartbeat records wake-ups on a task the user already owns, with no claim or
lease semantics.

Turn state that survived a crash is swept at boot: a turn a heartbeat started
before Stave was killed stays open in SQLite, and without the sweep every later
occurrence would defer behind a turn that will never finish.
