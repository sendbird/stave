# Tars prompt sizing

Run `bun scripts/measure-tars-prompts.ts` to measure the planner and execution
lead with real prompt builders, primary-agent compilation and the provider
prompt translator. The fixture has three responsibilities, three earlier
exchanges, two registered repositories, a full user mandate, acceptance
criteria, team limits and changing usage/counters. The later turn continues
the same work stage; a cold later turn also exercises context restoration.

Measurements below were taken before production edits and after them on
2026-11-12. Units are JavaScript string length (UTF-16 characters), **not
tokens**. They cover Stave's Tars-owned text, not a complete provider request.
Provider-owned system prompts, tool schemas/results, repository instructions,
ambient task context, conversation history and attachments are excluded.
The briefing is an optional tool response, measured separately from turn input.

## Execution lead

| Component | First before | First after | Primed later before | Primed later after |
| --- | ---: | ---: | ---: | ---: |
| Compiled agent instructions | 5,350 | 5,126 | 5,350 | 5,126 |
| Stage prompt | 3,887 | 3,106 | 3,887 | 3,106 |
| Initial context actually sent | 1,559 | 1,559 | 1,559 | 0 |
| Run-stage context | 1,609 | 1,609 | 1,770 | 1,770 |
| Team limits context | 1,993 | 1,993 | 1,993 | 1,993 |
| Serialization headings / workspace framing | 1,487 | 1,487 | 394 | 232 |
| **Total** | **15,885** | **14,880** | **14,953** | **12,227** |

The first turn falls **6.3%**; the primed later turn falls **18.2%**. A cold
later turn retains the full mandate/portfolio: **16,046 → 15,041** characters.
No mandate is truncated to meet these fixture budgets.

Overlapping breakdowns (do not add these again to the totals):

| Component | Before | After |
| --- | ---: | ---: |
| Supervisor instructions | 3,931 | 3,707 |
| Tars-specific instructions | 1,310 | 1,310 |
| Workflow purpose | 107 | 107 |
| Workflow constraints | 763 | 0 |
| Work-stage instruction | 961 | 961 |
| Work-stage acceptance criteria, JSON | 203 | 203 |
| Original mandate content | 1,262 | 1,262 |
| Frozen portfolio content | 297 | 297 |
| Optional briefing tool response, JSON | 2,787 | 2,026 |

The complete Tars authority policy stays in the frozen execution-agent
instructions, including on nudge turns; the workflow no longer repeats it.
Stage reporting, verification, approval, scope, pinned-resource, denial and
publication rules remain. Supervisor routing uses the live routing context
instead of a fixed list of model recommendations.

The canonical prompt serializer skips the immutable `tars:mandate` and
`tars:portfolio` sources only when the existing provider translator confirms a
primed native session with no unsynced history. The original context remains
in the request and durable run. A fresh session, failed resume or unsynced
history sends it again. This uses the same serialization gate for both
supported execution providers; it does not guess from the run's turn counter.

## Planner

The planner remains **35,306 characters**: instructions **28,436**, JSON data
**6,868**, and a two-character separator. Only field/instruction order changed.

| JSON field | Before | After |
| --- | ---: | ---: |
| representative / preferences | 6 / 2 | 6 / 2 |
| autonomy | 343 | 343 |
| availableAgents / omittedAgents | 1,594 / 1 | 1,594 / 1 |
| currentMessage | 1,293 | 1,293 |
| history / omittedHistory | 353 / 1 | 353 / 1 |
| waitingDecisions | 2 | 2 |
| schedules / omittedSchedules / schedulesAvailable | 2 / 1 / 5 | 2 / 1 / 5 |
| observation | 2,903 | 2,903 |
| inspections / inspectionRound | 2 / 1 | 2 / 1 |
| clock | 97 | 97 |

Individual JSON value lengths exclude their keys and punctuation. The stable
identity/authority/catalog precede message data, inspection results and the
clock. The final-inspection-round prohibition follows the other instructions
instead of interrupting their prefix. No planner authority rule was removed.

## Expected cache effect and limits

Removing duplicate policy and replay reduces submitted text regardless of
cache hits. It reduces uncached input when those characters would miss the
cache, and cached input when they would hit it. No token-to-character ratio or
cost saving is assumed.

Fixed rules precede retry feedback and criterion statuses in stage prompts;
team instructions and frozen model/helper limits precede usage, counters and
turn keys; run reporting instructions precede current stage state. This should
preserve longer matching prefixes when the other preceding text is unchanged.
It does not make later components independently cacheable: earlier changing
workspace context, history or provider serialization can still break the
overall prefix. No live cache-hit rate, token saving or latency was measured.

The reported roughly 838k input tokens cannot be reconstructed from this
fixture: accumulated tool/history input and provider-owned overhead are not
included. These changes do not establish that the original amplification is
fully resolved. Existing frozen agent/workflow snapshots keep their original
instructions; the deduplicated workflow and shorter Supervisor apply to new
runs. Provider-owned system prompts and compaction policies are unchanged.

## Regression coverage

`tests/tars-prompt-sizing.test.ts` bounds the representative assembled first,
primed later and cold later inputs at 15,200 / 12,500 / 15,400 characters. It
checks a single authority policy, unchanged safety rules, reporting and
static-prefix order, and full restoration for cold/unsynced sessions through
both provider translators. The budgets are fixture assertions, not runtime
limits on user content. `tests/canonical-request.test.ts` and
`tests/tars-ownership.test.ts` pin the moved policy and replay-source contract.
