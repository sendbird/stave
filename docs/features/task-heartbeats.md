# Task Heartbeats

A heartbeat wakes one existing task, in the same provider session — either on a
schedule or when work that task delegated finishes. It is the "keep going
without me" answer for work that is already underway — re-check CI on this PR
every ten minutes, re-read this dashboard every hour, pick the thread back up
when the child task you handed off returns — as opposed to a routine, which
mints a brand new task per occurrence.

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
| The same instant, or the same finished child, is delivered twice | The occurrence's idempotency key makes the second a no-op. |
| Completion cannot be observed for the task | **Stop**, `completion-unobservable`, rather than waiting for an event that will never arrive. |

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

The trigger is a discriminated union: `{ kind: "schedule" }` walks a cadence,
`{ kind: "completion" }` waits on delegated work. A completion heartbeat has no
`nextRunAt` at all — it waits on the ledger, not on the clock.

## Completion

A completion heartbeat wakes its task when work that task delegated finishes: a
child-task run on the run ledger whose origin is this task, reaching a terminal
status (`completed`, `failed`, `cancelled`, `interrupted`). Everything in the
priority order above applies unchanged — a user's turn still wins, a pending
approval still pauses, an archived task still stops it.

What differs is only where dueness comes from:

| Question | Schedule | Completion |
| --- | --- | --- |
| What makes it due? | An instant passed | A delegated run reached a terminal status |
| What is consumed? | One instant | One `(run, step, status)` |
| What bounds it? | Expiry and the occurrence cap | The occurrence cap, which is applied by default |
| Where does the next one come from? | `computeNextRoutineRunAt` | The ledger, on the next tick |

**Exactly once, however it is delivered.** Each completion is keyed by
`<heartbeatId>:fired:completion:<runId>:<stepId>:<status>` rather than by an
instant, because two children can finish in the same millisecond and a
timestamp key would silently drop one of them. The occurrence row is the guard:
if nothing new was accepted, no turn starts at all.

**A batch is one wake-up.** Three children finishing together consume three
completions and start one turn. Stacking three unattended turns onto a task is
the failure this coalescing exists to prevent; the parent's context lists all
three, with identity, phase, and reason only — never the child's transcript.

One wake-up folds in at most `maxCoalescedCompletions` (20) of them, oldest
first. A larger backlog is not dropped — the remainder is consumed by the next
tick's wake-up — so a fan-out of 50 children is two turns rather than one, and
the bound is what keeps a single prompt from growing without limit. It is an
explicit trade of "one turn per batch" for "no unbounded prompt", and the
occurrence cap still bounds the total either way.

**A spent receipt always produces something.** The `fired` row is written before
the turn starts, so it is the receipt: once it exists, that completion will
never be offered again. If the turn then fails to start, or Stave dies before it
does, the wake-up cannot be replayed without risking a second turn for work that
may already have been reported — so the other half of the contract applies and
the user is notified instead. Two paths cover it: the in-tick failure path
notifies immediately, and a boot sweep notifies for any `fired` row that has no
turn and no failure sibling, which is exactly a wake-up lost to a crash. Each
lost wake-up is marked so it is reported once, not once per restart.

**Bounded recursion.** The turn a completion wakes can delegate more work, whose
completion wakes it again, and nobody in that loop is the user. So a completion
heartbeat created without `maxOccurrences` gets a default cap of 20 and stops
with `occurrence-cap-reached`. A schedule heartbeat is still allowed to run
forever — the user chose a cadence and can see it.

### Observability

Before a completion heartbeat is created, the supervisor probes how completion
can be seen for that task and classifies it:

| Classification | Meaning |
| --- | --- |
| `provider_event` | The runtime reports that delegated work finished. Nothing returns this yet. |
| `stave_owned` | Stave sees it in its own run-ledger rows. This is what both runtimes classify as today. |
| `unsupported` | It cannot be seen. Creating a completion heartbeat is refused, and an existing one **stops** with `completion-unobservable`. |

Both provider runtimes classify identically, and deliberately so: a child task's
terminal state is a ledger row written by the child-task coordinator, so neither
runtime is the source and neither can be ahead of the other. That is why the
probe is a function of the ledger rather than of the provider.

The `unsupported` branch is the point of the enum. A completion heartbeat that
cannot observe completion would read `scheduled` forever while nothing was ever
going to wake it, leaving its task looking permanently busy. It stops with a
stated reason instead. A ledger read that merely *fails* on one tick is not a
verdict — the heartbeat idles and tries again.

The feed is read deeper than `CHILD_TASK_LIST_LIMIT`, which sizes the child-task
panel. The two limits answer different questions: truncating a list a human is
reading hides rows they can still go and find, while truncating the completion
feed loses a wake-up permanently, because only what the read returns is ever
consumed. So the window is at least as wide as the `fired`-row guard that
protects it — a completion still visible is at worst re-reported and deduped,
one that aged out of the read is gone.

**How the signal arrives, for now.** The supervisor reads the feed on its own
tick rather than being pushed at: nothing emits a completion event today, and
adding one means writing to the child-task coordinator — the layer that records
delegated execution, which this one is not allowed to reach into. So the ledger
row stays the single source of truth and the read is a poll. If a native
completion signal ever lands, it belongs behind the same `TaskCompletionSignal`
shape and the `provider_event` classification, so only the arrival changes and
none of the consume-exactly-once machinery does.

### Identity

A wake-up runs on the heartbeat's fingerprint — the provider and model it was
created against, which the decision policy has already refused to fire on unless
they still match the task's live ones. That identity is passed explicitly rather
than left to `runTask`'s default, because "wake this task" means wake it as
itself: a Codex task resumed under the product default would put a different
agent into the same conversation, mid-thread.

## Occurrences

Every firing, deferral, and skip is recorded with an idempotency key of
`<heartbeatId>:<outcome>:<scheduledFor>`, or, for a completion,
`<heartbeatId>:<outcome>:completion:<runId>:<stepId>:<status>`. A unique index on
`(heartbeat_id, idempotency_key)` turns a duplicate delivery into a no-op, and
it means repeated deferrals of one instant collapse into a single row rather
than one per tick.

Occurrence history is pruned to the most recent 100 per heartbeat, with one
exemption: `fired` rows survive past that cap, up to 256. For a completion they
are not history but the idempotency guard itself — the ledger keeps reporting a
finished child for as long as it sits in its own list window, so a burst of
deferrals must not be able to push that child's `fired` row out and make it look
new again. A schedule does not need the exemption: its instants only move
forward, so a pruned instant can never come due twice.

## Files

- [`src/lib/automation/task-supervisor.ts`](../../src/lib/automation/task-supervisor.ts) — schemas, catch-up walk, decision policy, transitions. Pure.
- [`electron/host-service/task-supervisor-runtime.ts`](../../electron/host-service/task-supervisor-runtime.ts) — the tick, the serialized operation chain, the boot sweep.
- [`electron/persistence/task-heartbeat-store.ts`](../../electron/persistence/task-heartbeat-store.ts) — `task_heartbeats`, `task_heartbeat_occurrences`.
- [`electron/host-service/local-mcp-runtime.ts`](../../electron/host-service/local-mcp-runtime.ts) — `getTaskSupervisionSnapshot`, `runHeartbeatTurn`, `listTaskCompletionSignals`.
- [`electron/main/task-supervisor-service.ts`](../../electron/main/task-supervisor-service.ts) — the main-process bridge.

## MCP tools

- `stave_list_task_heartbeats` — optionally scoped to a workspace
- `stave_get_task_heartbeat` — one heartbeat plus recent occurrences and their reasons
- `stave_create_task_heartbeat` — requires an existing `taskId`
- `stave_update_task_heartbeat` — also re-accepts the task's current runtime
- `stave_set_task_heartbeat_paused` — pause or resume
- `stave_remove_task_heartbeat` — deletes the heartbeat and its history

## Storage

Two tables, not ledger tables. The run ledger records delegated execution; a
heartbeat records wake-ups on a task the user already owns, with no claim or
lease semantics. The completion trigger does not blur that: it *reads* terminal
child-task rows through an injected function and writes only its own occurrence
rows. The supervisor imports neither the ledger store nor the child-task
coordinator, and a boundary test keeps it that way.

Turn state that survived a crash is swept at boot: a turn a heartbeat started
before Stave was killed stays open in SQLite, and without the sweep every later
occurrence would defer behind a turn that will never finish.
