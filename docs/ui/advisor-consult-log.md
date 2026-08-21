# Advisor Consult Log

Status: **implemented (session-only)**

Supersedes [`advisor-interaction-map.md`](./advisor-interaction-map.md), which
was drawn for the preflight-era Advisor and plans a graph around prompt
injection. That injection step does not exist in the on-demand Advisor, so that
document is historical and must not be read as live guidance.

## The problem

The on-demand Advisor lets the primary model consult a separate read-only model
mid-turn via the `stave_consult_advisor` Local MCP tool. Before this surface,
none of it was reviewable:

- `advisorExchangeByTask` holds **one** snapshot per task. A second consult in
  the same turn overwrote the first; only a `settledConsults` counter survived.
- Provider events are rAF-batched, and rAF is paused while the window is hidden
  or occluded, so one flush routinely carries several *complete* consults. Any
  "diff the map after the flush" archive would have kept only the last one.
- The floating exchange card auto-hides after 6s settled / 20s attention.

So the question text and the advice existed for a few seconds and were then
unrecoverable.

## What the surface does and does not claim

It shows, per consult: what was asked, what came back, the lifecycle, the
isolation and effort the runtime actually applied, what the consult cost, and
which tool calls of the same turn started after it settled.

It does **not** infer impact. Advice returns as an MCP tool result and the
primary is free to ignore it; there is no injection step and no `applied` phase.
Two lines of copy carry that limit and are asserted verbatim in
`tests/advisor-consult-log-render.test.tsx`:

- *"Tool calls in this turn that started after the consult settled, in order.
  Sequence only — Stave cannot tell whether the advice caused them."*
- *"Reported by the runtime for the advisor call only. Stave reports usage per
  message, not per turn, so this is not a share of the turn's total."*

The second exists because `ChatMessage.usage` is per message and carries no
`turnId`, and `buildUsageMetric` sums over the *paged* message list — so any
"% of the turn" denominator the renderer could build would silently drift.

Effectiveness is therefore a **user-set verdict** (Helpful / Not helpful /
Ignored), aggregated per advisor model rather than per task so it survives ring
eviction. The aggregate line has no denominator for the same reason.

## Shape

| Piece | Where |
| --- | --- |
| Pure state, ring, verdict tally | `src/lib/providers/advisor-consult-log.ts` |
| Archive hook inside the fold loop | `applyAdvisorActivityEvents`, `src/lib/providers/advisor-activity.ts` |
| Store slices and four actions | `app-store.types.ts`, `app-store-provider-interaction-actions.ts` |
| Presentation projection | `src/components/session/advisor-consult-log.utils.ts` |
| Dialog + store-connected host | `src/components/session/AdvisorConsultLogDialog.tsx` |

No new provider event, IPC channel, schema, or SQLite table: `advisor_activity`
already carries every field.

`foldAdvisorEvent` returns its input snapshot **by reference** to mean "nothing
changed", which is what lets the archive run once per folded *step* instead of
once per flush. That is the whole fix for the batching loss above.

The host is mounted in `ChatArea`, not inside either trigger, because both
triggers are short-lived: the exchange card clears on its linger timer and the
turn activity shelf is keyed `${taskId}:${activeTurnId}`. A dialog owned by
either would vanish mid-read. Store-held open state is also what lets the shelf
trigger exist without touching `ChatInput.tsx`.

The shelf's advisor row uses `detailSurface: "advisor-consult-log"` rather than
borrowing `toolUseId`: that field asserts "the transcript can reveal this call",
and a consult has nothing to reveal. `data-turn-activity-revealable` stays
tool-only; the advisor row carries `data-turn-activity-opens` instead.

## Bounds

- `ADVISOR_CONSULT_LOG_LIMIT = 24` per task. Must stay **≥
  `MAX_ADVISOR_CONSULT_LIMIT` (20)**, or a turn that spends its whole consult
  budget evicts its own earliest consults — the exact failure being fixed.
- `ADVISOR_CONSULT_LOG_TASK_LIMIT = 8`, matching
  `RETAINED_TURN_ACTIVITY_LIMIT`.
- Worst case ≈ 4 MB, in memory, shed with the task.

## Known limits

- **"What ran after" is a lossy sample.** Work items exist only for the live
  turn and the last finished turn per task, and are capped
  (`PROVIDER_TURN_WORK_ITEM_LIMIT = 12`,
  `PROVIDER_TURN_GENERAL_TOOL_LIMIT = 3`). Older consults render the empty
  state, which says so rather than implying nothing ran.
- **Verdicts outlive their entries** by design; the "this session" wording
  carries that.
- **`consultIndex` is not unique** — a recoverable provider retry can repeat
  it. Entries key on `exchangeId` (falling back to `startedAt`), so no code may
  assume index uniqueness.
- **A reload erases the log.** A durable SQLite-backed log is the follow-up;
  `selectAdvisorConsultLog` plus a hydrate action is the only swap needed, with
  no component changes.
- `ADVISOR_STAGE_LIMIT = 12` still truncates the lifecycle inside an archived
  entry.
