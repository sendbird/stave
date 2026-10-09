# Check-back schedules (wake-ups)

In the app this is the **Check back on a task** kind of [Schedule](automations.md):
it appears in the same Schedules list as start-a-task schedules, is created from
the same sheet (Where: `An existing task`) or from a task tab's `Check back…`
menu item, and is called a wake-up only in code, storage and the MCP tool names.
A task has at most one; `Check back…` on a task that has one edits it. Rows offer
`Pause` and `Resume`; there is no `Run now`.

A wake-up resumes one existing task, in the same provider session — on a
schedule, when work that task delegated finishes, or when the task's pull
request needs fixing. It is the "keep going without me" answer for work that is
already underway — re-read this dashboard every hour, pick the thread back up
when the delegated task you handed off returns, fix CI when it fails on the
pull request this task opened — as opposed to an automation, which mints a brand
new task per occurrence.

The boundary between the two is fixed in
[Agent Platform Taxonomy](../architecture/agent-platform-taxonomy.md): **an
automation never wakes an existing task, and a wake-up never creates one.**

## What it adds over `runTask`

`runTask(taskId)` could already add a turn to an existing task. Everything a
wake-up adds is safety around doing that unattended:

| Situation | What happens |
| --- | --- |
| The user is mid-turn | The occurrence **defers**. It is not consumed, so it fires as soon as the task is free. |
| The task is waiting on an approval or a question | **Pause**, `awaiting-approval` / `awaiting-user-input`. Resumes itself once answered. |
| The task's provider or model changed | **Pause**, `runtime-changed`. Only an update clears it — the user has to agree to the new runtime. |
| The task moved, or the fleet control plane rejects its identity | **Pause**, `task-identity-changed`. |
| An agent run is running or paused on the task | **Pause**, `agent-run-active`. Resumes itself when the agent run ends. Creating, updating or resuming a wake-up on that task is refused meanwhile: one source of automatic turns per task. |
| The task was archived or deleted | **Stop**, `task-unavailable`. |
| The expiry passed, or the next instant would fall past it | **Stop**, `expired`. |
| The occurrence cap was reached | **Stop**, `occurrence-cap-reached`. |
| Stave was closed across several instants | **Catch up once.** The latest instant fires; earlier ones are recorded as skipped. |
| The same instant, or the same finished child, is delivered twice | The occurrence's idempotency key makes the second a no-op. |
| Completion cannot be observed for the task | **Stop**, `completion-unobservable`, rather than waiting for an event that will never arrive. |
| A watched pull request merged, or closed (or can no longer be found) | **Stop**, `pull-request-merged` / `pull-request-closed`. |
| GitHub stayed unreadable for a watch | **Stop**, `pull-request-unreadable`, after 8 failed reads in a row with a doubling backoff. |

Paused and stopped states always carry a reason. A stopped wake-up is
terminal: resuming it is refused, because resuming would silently ignore the
reason it stopped. Add a new one instead.

## Priority order

The policy is a single ordered decision, in
[`src/lib/supervision/wake-up-policy.ts`](../../src/lib/supervision/wake-up-policy.ts):

1. Terminal conditions (task gone, archived, expired, capped, watched pull request merged, closed or unreadable) — **stop**
2. An agent run owns the task's automatic turns — **pause** (`agent-run-active`)
3. Blocking conditions (identity, runtime, approval, question) — **pause**
4. Nothing blocking and the pause was automatic — **resume**
5. Not due yet — idle
6. Due, but a turn is running — **defer**
7. Due and free — **fire**

Stop beats pause, pause beats defer, defer beats fire. A user's turn always
wins.

## Schedules

Wake-ups reuse the automation schedule vocabulary — `{ every, unit, at?,
weekday?, weekdays? }` and `computeNextAutomationRunAt` from
[`src/lib/automations.ts`](../../src/lib/automations.ts) — so there is one cadence
model across the product and anchored day/week schedules keep their local
wall-clock time across DST.

The trigger is a discriminated union: `{ kind: "schedule" }` walks a cadence,
`{ kind: "completion" }` waits on delegated work, and `{ kind: "pull_request",
events }` watches the task's pull request. Completion and pull request
wake-ups have no `nextRunAt` at all — they wait on the ledger or on GitHub, not
on the clock.

## Completion

A completion wake-up resumes its task when work that task delegated finishes: a
delegated-task run on the run ledger whose origin is this task, reaching a terminal
status (`completed`, `failed`, `cancelled`, `interrupted`). Everything in the
priority order above applies unchanged — a user's turn still wins, a pending
approval still pauses, an archived task still stops it.

What differs is only where dueness comes from:

| Question | Schedule | Completion |
| --- | --- | --- |
| What makes it due? | An instant passed | A delegated run reached a terminal status |
| What is consumed? | One instant | One `(run, step, attempt, status)` |
| What bounds it? | Expiry and the occurrence cap | The occurrence cap, which is applied by default |
| Where does the next one come from? | `computeNextAutomationRunAt` | The ledger, on the next tick |

**Exactly once, however it is delivered.** Each completion is keyed by
`<wakeUpId>:fired:completion:<runId>:<stepId>:<attempt>:<status>` rather
than by an instant, because two children can finish in the same millisecond and
a timestamp key would silently drop one of them. The attempt is part of the key
because a retried delegation reuses its run and step ids: without it, a retry
that fails again would be deduped against the first attempt's wake-up and the
parent would never hear about it. The occurrence row is the guard: if nothing
new was accepted, no turn starts at all.

**Only work that finishes after the wake-up exists counts.** Completions
whose terminal instant predates the wake-up's `createdAt` are never
signalable. Without that baseline, creating a completion wake-up on a task
with old finished delegations — or re-creating one whose stopped predecessor's
history was just deleted — would consume every old receipt still in the feed
window as a burst of wake-ups. Updating a wake-up keeps its `createdAt`, so
an update never re-opens old work either.

**Detached children signal on ending, not between turns.** A `detached`
delegation parks in `waiting` while its delegated task stays open, and `waiting` is
an active phase — so a detached child's individual turns never appear in the
completion feed. The delegation becomes a signal only when it settles into a
terminal status (the parent stops it, it fails, or it is interrupted). A parent
that wants to be woken per turn of a detached child should use a schedule
trigger instead.

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
wake-up created without `maxOccurrences` gets a default cap of 20 and stops
with `occurrence-cap-reached`. A schedule wake-up is still allowed to run
forever — the user chose a cadence and can see it.

### Observability

Before a completion wake-up is created, the supervisor probes how completion
can be seen for that task and classifies it:

| Classification | Meaning |
| --- | --- |
| `provider_event` | The runtime reports that delegated work finished. Nothing returns this yet. |
| `stave_owned` | Stave sees it in its own run-ledger rows. This is what both runtimes classify as today. |
| `unsupported` | It cannot be seen. Creating a completion wake-up is refused, and an existing one **stops** with `completion-unobservable`. |

Both provider runtimes classify identically, and deliberately so: a delegated task's
terminal state is a ledger row written by the delegated-task coordinator, so neither
runtime is the source and neither can be ahead of the other. That is why the
probe is a function of the ledger rather than of the provider.

The `unsupported` branch is the point of the enum. A completion wake-up that
cannot observe completion would read `scheduled` forever while nothing was ever
going to wake it, leaving its task looking permanently busy. It stops with a
stated reason instead. A ledger read that merely *fails* on one tick is not a
verdict — the wake-up idles and tries again.

The feed is read deeper than `DELEGATED_TASK_LIST_LIMIT`, which sizes the delegated-task
panel. The two limits answer different questions: truncating a list a human is
reading hides rows they can still go and find, while truncating the completion
feed loses a wake-up permanently, because only what the read returns is ever
consumed. The safety inequality runs the other way around: the `fired`-row
retention that guards consumption must be **at least as wide as the feed
window** (`maxCompletionFeedRows` ≤ `minRetainedFiredOccurrences`, pinned by a
test). If the feed could still report a completion whose consumed `fired` row
had already been pruned, that completion would read as brand new and wake the
task a second time. A completion still visible and still guarded is at worst
re-reported and deduped; one that aged out of the read unconsumed is gone.

**How the signal arrives, for now.** The supervisor reads the feed on its own
tick rather than being pushed at: nothing emits a completion event today, and
adding one means writing to the delegated-task coordinator — the layer that records
delegated execution, which this one is not allowed to reach into. So the ledger
row stays the single source of truth and the read is a poll. If a native
completion signal ever lands, it belongs behind the same `TaskCompletionSignal`
shape and the `provider_event` classification, so only the arrival changes and
none of the consume-exactly-once machinery does.

## Pull request watch

A pull request watch wakes its task when the pull request of the task's
workspace branch needs fixing. In Schedules it reads **Watch a pull request**:
the row says which pull request it follows, what it wakes on, what the last
check saw and how many times it woke the task; the editor's `When its pull
request needs fixing` choice edits its events. The trigger names no pull
request: it follows the task's branch until it sees one, then keeps reading
that pull request by number.

| Event | What wakes the task | What the turn is told |
| --- | --- | --- |
| `checks_failed` | A check fails on the head commit | The failing checks with links to their logs, and which earlier failures are still failing |
| `merge_conflict` | GitHub reports the branch as conflicting with its base | The base branch, and to merge or rebase, resolve, run the checks and push |
| `review_comments` | A new comment in an unresolved, current review thread | The comments with author, file, line and link, framed as feedback to evaluate rather than instructions |

**Created for you on Create PR.** When the Create PR flow opens a pull request
— including when only queuing auto-merge failed — Stave adds a watch with
`checks_failed` and `merge_conflict` to the task it was created from. Review
comments stay opt-in per task, from Schedules or `stave_update_wake_up`.
**Settings → Prompts → PR Completion → Watch pull requests Stave creates** turns
this off. A task has one wake-up, so an existing pull request watch is kept and
an existing check-back schedule is never replaced; a toast says which happened.
Pull requests created outside that flow are watched only when you add a watch.

**Polling.** The host reads GitHub through the `gh` CLI every 2 minutes per
watch, outside the serialized wake-up chain, so a slow read never holds up a
list, an edit or a pause. A read asks only for what the watch needs: the pull
request itself, its check rows only when the rollup reports a failure, and its
review threads only when review comments are watched. A failed read doubles the
interval (up to 30 minutes); 8 in a row stop the watch with
`pull-request-unreadable`, and one good read resets the count.

**The same failure fires once.** Each fact the watch can wake on has a stable
key — `checks_failed:<head>:<check>`, `merge_conflict:<head>`,
`review_comment:<id>` — and is consumed with a `fired` occurrence row, exactly
like a completion. Polling the same failing check on the same head is one
receipt and one turn. Another check failing, the same check failing again on a
new head after a push, or a new comment is a new fact and wakes the task
again. Everything new on one read is folded into a single turn. A new watch
reports whatever is already failing once.

**Never during a turn.** A watch that finds something new while the task is
mid-turn defers, exactly as a due schedule does: the signals stay unconsumed and
one `deferred` row records the wait. When the turn ends the watch reads GitHub
again on the very next tick rather than waiting out the interval, so the queued
wake lands right after the turn, on fresh state — and not at all if that turn
already fixed it. Approvals, questions, runtime changes and agent runs pause a
watch the same way they pause any wake-up.

**Bounded.** A pushed fix can fail again and wake the task again with nobody in
between, so a watch created without `maxOccurrences` is capped at 10 wakes.
Expiry, pause and resume, receipts, failure notifications and the boot sweeps
are the wake-up runtime's, unchanged. Like every wake-up it runs Claude and
Codex tasks through the same supervised-turn path, as the task's own provider
and model.

### Identity

A wake-up runs on the wake-up's fingerprint — the provider and model it was
created against, which the decision policy has already refused to fire on unless
they still match the task's live ones. That identity is passed explicitly rather
than left to `runTask`'s default, because "wake this task" means wake it as
itself: a Codex task resumed under the product default would put a different
agent into the same conversation, mid-thread.

### Permissions

A wake-up has no consent of its own, so its turn runs with your provider
permission settings for the task's provider (Claude or Codex) — the same ones
your own turns use, as synced to the host for delegation — read when it fires.
Before any settings were synced, it uses guarded defaults (Claude `default`
with the sandbox on; Codex `untrusted`, workspace-write, network off), never
the runtime's wider fallbacks.

## Occurrences

Every firing, deferral, and skip is recorded with an idempotency key of
`<wakeUpId>:<outcome>:<scheduledFor>`, for a completion
`<wakeUpId>:<outcome>:completion:<runId>:<stepId>:<attempt>:<status>`, or, for
a pull request watch, `<wakeUpId>:<outcome>:pull_request:<signal key>`. A
unique index on `(wake_up_id, idempotency_key)` turns a duplicate delivery
into a no-op, and it means repeated deferrals of one instant collapse into a
single row rather than one per tick.

Occurrence history is pruned to the most recent 100 per wake-up, with one
exemption: `fired` rows survive past that cap, up to 256. For a completion they
are not history but the idempotency guard itself — the ledger keeps reporting a
finished child for as long as it sits in its own list window, so a burst of
deferrals must not be able to push that child's `fired` row out and make it look
new again. A schedule does not need the exemption: its instants only move
forward, so a pruned instant can never come due twice.

## Files

- [`src/lib/supervision/wake-up-policy.ts`](../../src/lib/supervision/wake-up-policy.ts) — schemas, catch-up walk, decision policy, transitions. Pure.
- [`src/lib/supervision/pull-request-watch.ts`](../../src/lib/supervision/pull-request-watch.ts) — the pull request trigger, its state, signals, polling and prompt. Pure.
- [`electron/host-service/pull-request-watch-reader.ts`](../../electron/host-service/pull-request-watch-reader.ts) — reads the watched pull request through `gh`.
- [`electron/host-service/wake-up-runtime.ts`](../../electron/host-service/wake-up-runtime.ts) — the tick, the serialized operation chain, the boot sweep.
- [`electron/persistence/wake-up-store.ts`](../../electron/persistence/wake-up-store.ts) — `wake_ups` (a watch's state in `watch_state_json`), `wake_up_occurrences`.
- [`electron/host-service/local-mcp-runtime.ts`](../../electron/host-service/local-mcp-runtime.ts) — `getTaskSupervisionSnapshot`.
- [`electron/host-service/delegated-task-signals.ts`](../../electron/host-service/delegated-task-signals.ts) — `listTaskCompletionSignals`.
- [`electron/host-service/supervised-turn.ts`](../../electron/host-service/supervised-turn.ts) — `runSupervisedTurn`, the only way a supervisor starts a turn.
- [`electron/main/wake-up-service.ts`](../../electron/main/wake-up-service.ts) — the main-process bridge.

## MCP tools

- `stave_list_wake_ups` — optionally scoped to a workspace
- `stave_get_wake_up` — one wake-up plus recent occurrences and their reasons
- `stave_create_wake_up` — requires an existing `taskId`; `trigger: { kind: "pull_request", events: [...] }` adds a pull request watch
- `stave_update_wake_up` — also re-accepts the task's current runtime; refused for a stopped wake-up (add a new one instead), and switching trigger kinds resets the fired count so the new trigger's cap starts unspent. Changing a pull request watch's events keeps what it already reported
- `stave_set_wake_up_paused` — pause or resume
- `stave_remove_wake_up` — deletes the wake-up and its history

## Storage

Two tables, not ledger tables. The run ledger records delegated execution; a
wake-up records wake-ups on a task the user already owns, with no claim or
lease semantics. The completion trigger does not blur that: it *reads* terminal
delegated-task rows through an injected function and writes only its own occurrence
rows. The supervisor imports neither the ledger store nor the delegated-task
coordinator, and a boundary test keeps it that way.

Turn state that survived a crash is swept at boot: a turn a wake-up started
before Stave was killed stays open in SQLite, and without the sweep every later
occurrence would defer behind a turn that will never finish.
