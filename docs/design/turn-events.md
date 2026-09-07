# Turn-event grammar

How Stave renders one assistant turn. This document is prescriptive: it names
the event kinds, the anatomy each one gets, the state matrix, and the ADS
component every kind maps to. A new kind is added by extending this table, not
by inventing a surface.

The design authority is the ADS agent-surface grammar
(`decisions/agent-surface-grammar.md` in Atelier) and the tokens in
[`src/components/ads/tokens/tokens.stylex.ts`](../../src/components/ads/tokens/tokens.stylex.ts).
Values below are tokens, never literals. Where a token does not exist, the
value is a caller-owned prop on an ADS component, and that is stated.

## 1. Kinds and their components

The trace is built by
[`assistant-trace-builder.ts`](../../src/components/session/message/assistant-trace-builder.ts),
which produces one entry per kind. Every entry is one step on the rail.

| Kind                     | ADS component                | Notes                                                                        |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| reasoning                | `Thinking`                   | phase label shimmers, settles to its measured duration                       |
| tool run                 | `ToolRun`                    | `icon` names the kind of work; `tool` carries the target                      |
| command run              | `ToolRun` + `CommandResult`  | `CommandResult` is a host composition, not a second ADS component            |
| file change / diff       | `FileChangeSummary` + `DiffViewer` | the summary is the header the diff does not draw                       |
| search / web + citations | `ToolRun` + `Citation.List`  | sources come from URLs in the provider's own output                          |
| subagent                 | `ToolRun`                    | `Bot` glyph, prompt in `input`, report in `output` as prose                   |
| todo / plan              | `ToolRun` + `Plan`           | TodoWrite is a real tool call; the plan is its payload                        |
| approval                 | `Approval`                   | ADS is presentation only — the decision still calls `resolveApproval`         |
| user input               | `Clarification`              | fields are ADS `RadioGroup` / `Checkbox` / `TextField`                        |
| system                   | `agentSurface` + `inlineDisclosure` | a recipe composition: ADS has no notice surface — see §8               |
| assistant text (interim) | none                         | prose on the rail, no disclosure — it is language, not an event               |

Two rules that decide what does **not** become a kind:

- A mixed chronological stream is a *composition* of `Thinking` and `ToolRun`
  on a rail, never a fourteenth component with its own vocabulary.
- A kind that only differs by glyph and label is not a new kind. It is an
  `icon` and a `title` on `ToolRun`.

## 2. Anatomy

Every event row is the same five slots, in this order. A kind may omit a slot;
no kind may add one or reorder them.

```
[ status glyph / chevron ]  label  ·  target  ·  count  ·  duration      ▸ body
```

| Slot        | Register                                              | Owner                                  |
| ----------- | ----------------------------------------------------- | -------------------------------------- |
| status mark | glyph at the `md` icon step, or a `Loader` while live | `InlineDisclosureIcon` inside the row |
| label       | `fontSizeBody` + `fontWeightMedium`, `agentSurface.rowLabel` | `ToolRun` `title` / `Thinking` `phase` |
| status word | `fontSizeCaption`, one `agentStatusWord` tone         | `ToolRun`, from `AgentRunState`        |
| target      | `agentSurface.meta` (mono, `tabular-nums`, `colorTextSubtle`) | `ToolRun` `tool`              |
| count       | `agentSurface.meta`                                   | `ToolRun` `count`                      |
| duration    | `agentSurface.meta`                                   | measured only — §4                     |
| chevron     | replaces the glyph on hover and focus-visible         | `inline-disclosure-motion.css`         |
| body        | `inlineDisclosure.body` tint (rung 4)                 | `ToolRun` sections / `Thinking` trace  |

The status mark and the chevron share one slot on purpose. One leading mark per
row is the whole anatomy; a second mark out on the rail restates a status the
row's own spinner, colored word and ink already carry. **This includes the turn
header** — the row that owns every other row here composes the same
`inlineDisclosure` trigger and the same leading slot, so its chevron is not on
the trailing edge and its glyph column lines up with the rows underneath it.

**Three ink tiers, not two.** `agentSurface.rowLabel` sits between body ink and
the machine register, and it is what every repeated row label takes — a tool
title, a settled thought's summary line, a runtime notice. Body ink put a
column of ten row labels at the same weight as the answer under the trace;
`colorTextMuted` dropped them into the register of the duration they have to
outrank. The turn header is the one line one step darker (body ink): a
container that shares its contents' ink reads as one more row.

**No card.** A row is rung 0 at rest: no perimeter, no fill, padding and a hover
wash. At most one rung-5 perimeter may appear per turn, and a turn of tool calls
has none.

## 3. The rail

Rung 2 of the containment ladder, and one primitive:
[`StepRail`](../../src/components/ads/components/StepRail.tsx).

- Gutter: `space24`. Column gap: `space8`.
- Marker box: `controlHeightSm`, centred in the gutter, so two adjacent steps
  with differently sized marks keep the rule straight.
- Connector: `borderWidthHairline` on `colorBorderSubtle`, `flex: 1` under the
  marker.
- The last step passes `connector={false}`. A rule that runs past the final
  marker points at nothing and reads as truncated content.
- Body pad: `space12`, which is what gives a one-line step a visible rule at all.
- **The rail height is never animated.** The connector is a flexible track, so
  it already follows the body disclosure's own `block-size` transition. A second
  transition on the rail lags behind the marker it connects to.

Stave's trace does not number its steps; the rail's `marker` slot is where a
number would go if it did.

## 4. State matrix

One lifecycle union — ADS `AgentRunState` — shared by every surface. The host
maps into it exactly once, in
[`turn-event-state.ts`](../../src/components/session/message/turn-event-state.ts).

| Provider state              | `AgentRunState` | Status word        | Disclosure                      |
| --------------------------- | --------------- | ------------------ | ------------------------------- |
| (absent)                    | `pending`       | Pending, neutral   | closed                          |
| `input-streaming`           | `running`       | Running, accent    | closed, live clock on the header |
| `input-available`           | `running`       | Running, accent    | closed, live clock on the header |
| `output-available`          | `done`          | Completed, success | closed                          |
| `output-error`              | `failed`        | Failed, danger     | **stays open**                  |
| approval requested          | `approval`      | Awaiting approval  | **stays open**                  |
| interrupted / canceled turn | `interrupted` / `canceled` | warning / neutral | closed             |

The four kinds adopted last are the same matrix read against the signal each
one actually has. Two of them have no disclosure at all, and that is the
correct answer rather than a gap:

| Kind        | Live means                          | Open                            | Settled                                            |
| ----------- | ----------------------------------- | ------------------------------- | -------------------------------------------------- |
| todo / plan | the TodoWrite call is running       | `ToolRun` stays closed; `Plan` inside | stays closed, and the row keeps `done / total`  |
| approval    | — (no run)                          | always, until answered          | the audit record replaces the buttons in place      |
| user input  | — (no run)                          | always, until answered          | the recorded answer replaces the fields in place    |
| system      | the notice is a failure or boundary | attention notices stay open     | an ordinary notice stays closed to its one titled line |

- **A plan is not a disclosure of its own.** `Plan` has no collapsed form by
  design — it is the durable half of the reasoning story and stays readable
  after the thought that produced it closed. Collapsibility comes from the
  `ToolRun` row it is the payload of, so the plan settles with the call that
  wrote it, and the collapsed row still carries the progress count. Nothing is
  hidden by the collapse.
- **A decision surface has no collapsed form either.** Open, the payload *is*
  the question; resolved, it is the audit record. Neither state has a one-line
  summary to collapse to, and §4.2's rule already exempts an approval gate from
  auto-collapse. The resolution is *preserved in place*, not replaced: the
  title, the description and the arguments the action would have run with all
  survive the decision, because a decision you cannot see afterwards is a
  decision you cannot audit.
- **A notice has no clock**, so `live` is read as "attention": a provider
  failure, a capacity error or a compaction boundary stays open, and everything
  else collapses. That is `isAttentionState`'s rule evaluated against the only
  signal the kind has.

### Records that are not decisions

Two states in this family are neither answered nor pending, and §5 forbids
rendering them as the nearest one:

| Stave state            | ADS value                        | Why not the nearest decision                                                 |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `approval-responded`   | `outcome.decision: "allowed"`    | Stave keeps *whether* it was answered, not the scope. `allow-once` claims a single-use grant and `allow-always` a standing one; both state a fact nobody recorded. |
| `approval-interrupted` | `outcome.decision: "lapsed"`     | `deny` credits the reader with a refusal they never gave; a `null` outcome leaves three live buttons on a gate the host can no longer answer.                      |
| `input-interrupted`    | `outcome.result: "lapsed"`       | `skipped` is a reader's choice. Same argument, same word on screen — "Withdrawn" — so the two surfaces cannot name one event twice.                                |

Both `lapsed` values take neutral ink and never `danger`: a lapse is not a
refusal. They were added to ADS in this pass —
`consumer-changes/2026-09-07-approval-resolution-beyond-the-decision.json` and
`2026-09-07-clarification-lapsed-result.json`.

Rules, all owned by ADS `useSettleDisclosure` and `isAttentionState` — do not
re-derive them per call site:

1. **Closed by default.** A running payload stays behind the disclosure. The
   header already carries the status word and the live clock, so auto-opening
   every row turns a turn of tool calls into a stack of payloads. Interim
   assistant text is the exception: it is language, not an event, and stays
   visible on the rail with no disclosure.
2. **Attention stays open.** A failure, denial or approval gate counts as live
   for the disclosure, because collapsing it would hide the one payload worth
   reading the instant it appeared.
3. **The reader outranks the default.** Toggling a row during a run is a
   choice about *this* run.
4. **The turn-level trace** (`ChainOfThought`) opens while the turn streams and
   collapses once, on completion, unless the turn ended in an actionable
   failure. A manual re-open is not stolen back.

## 5. Progress must not invent precision

`durationMs` is passed only where something was measured — `elapsedSeconds` from
the provider, or a reasoning pass's `startedAt`/`completedAt`. Given no
measurement, ADS renders **no** duration; that is the correct output, not a gap
to fill. No percentages, ever: there is no percentage to know.

`NormalizedProviderEvent.tool_result` carries `output` and `isError` and nothing
else. A command surface therefore shows an error **tone** and no exit code. An
invented `exit 1` beside a real stderr dump is worse than no number.

## 6. Capped viewports

[`CappedViewport`](../../src/components/ads/components/CappedViewport.tsx) bounds
a payload that has no bound of its own: a growing chain of thought, a command's
output.

- Cap: `maxBlockSize`, default `220` (a caller-owned prop — there is no
  max-height token). Streaming reasoning uses the same value.
- Fade band: `space16`.
- Edges: **top only while streaming** (there is nothing below the live edge to
  hint at), **both once settled**.
- The fade is a cap-tall mask layer anchored to the *opposite* edge, so it
  appears only once the box has actually grown to the cap. A box-relative
  gradient fades two-line content and makes a short payload look clipped.
- Live edge: follow while growing, and release on any upward reader movement.
  The arithmetic is `Thread.liveEdge`'s — direction beats position, and a
  collapsing payload is not a scroll-up.
- The region is `role="log"`, `aria-live="polite"`, `aria-busy` while live.
- **The cap belongs to the payload, never to the trace.** Capping the whole
  trace pushes the labelled step rows off the top, and the reader watches an
  unlabelled column of prose.

A reasoning *trace* is deliberately not a live region: re-announcing a growing
chain of thought on every token is unusable. `Thinking` announces the two
transitions through one polite `role="status"` line instead.

## 7. Motion

Durations and curves come from the token contract. Never `all`; name the
properties.

| What                     | Token                                                    |
| ------------------------ | -------------------------------------------------------- |
| hover / press            | `motionDurationFast`, `motionEaseStandard` (`transition.colors`) |
| disclosure open          | `motionDurationEmphasis`, `motionEaseExpressive`         |
| disclosure close         | `motionDurationQuick`, `motionEaseStandard`              |
| chevron rotate + glyph swap | `motionDurationQuick`, `motionEaseExpressive`         |
| step / trace entrance    | `motionDurationNormal`–`Emphasis`, `motionEaseStandard`/`Expressive` |
| reasoning glyph pulse    | `motionDurationLoopSlow`, `motionEaseInOut`              |
| phase-label shimmer      | `recipes/text-shimmer` via `TextShimmer` — never re-implemented |

The collapse is a **row-track animation on a mounted panel**: ADS animates
`block-size` against the panel's measured height
(`.atelier-motion-collapse` in `overlay-motion.css`), which is this system's
form of the `grid-template-rows: 0fr → 1fr` construction. It is not a
mount/unmount, so the rail and the transcript both follow it.

No surface in this family runs a private curve. `chain-of-thought.styles.ts`
used to keep three hand-tuned `cubic-bezier` constants and raw
150/200/220/250/260ms literals; they are tokens now, and the one that overshot
past 1 is gone — §5 spends the family's single attention-taking animation on the
composer's working state, not on a bounce under every trace row.

Streaming text reveals by **opacity only**. Movement belongs to discrete objects
that arrive as a unit — a step, a chip — which may rise a few pixels. Under
`prefers-reduced-motion`, opacity and color feedback stay and translation,
blur and overshoot go; every `transition.*` key already carries that override,
which is why components compose it instead of hand-rolling a transition.

## 8. Notices, and the one surface ADS does not have

`todo`, `approval` and `user input` now render through `Plan`, `Approval` and
`Clarification`. `system` does not, because ADS has no notice surface and the
two candidates are both the wrong shape:

- `ToolRun` would name a runtime event a "tool call", which is exactly the
  two-names-for-one-state bug the shared `AgentRunState` exists to prevent.
- `Callout` is authored prose in a reading column. It draws a tint and has no
  disclosure, and a transcript notice is neither authored nor short — its
  payload is a stack trace or a recovery action.

So the notice row is *composed* from the primitives ADS publishes for the job:
`agentSurface.row` for the row, the `inlineDisclosure` recipe for the
trigger / panel / body rungs, `InlineDisclosureIcon` for the single leading
slot that swaps the glyph for the chevron, and `useSettleDisclosure` for the
lifecycle. Every token, rung and curve therefore still comes from ADS and
nothing is re-derived, which is the difference between composing the system and
forking it. If ADS grows an agent-notice component, this composition is what it
should replace.

`Checkpoint` is installed but not yet wired. It is the right surface for a
compaction boundary — two hairlines flanking a glyph, a label, a machine value
and a Restore control, and explicitly not a card in the stack — but Stave's
restore runs a destructive `git restore --worktree` behind a
**confirm-then-restore** second click, and `Checkpoint` models a single
`onRestore`. Swapping now would silently drop the confirmation step, so the
boundary keeps the host surface until ADS can express a destructive restore.

`ToolRun.Group` is likewise not used yet. The trace's grouping axis is
adjacency *within* a step — reasoning parts, diff parts — not runs of sibling
tool calls, and the rail already provides the rung-2 grouping that a
non-rolled-up group would.

## 9. Prose is not markup

The transcript's markdown renderer had no `h1`–`h6` overrides, so a heading in
assistant prose fell through to the user-agent sheet at `2em` bold — and once
ADS's reset zeroed the UA `margin-block` on headings, that landed as an
outsized bold line with no separation from the paragraphs around it. It is
fixed in the host prose layer, where it belongs: `markdownStyles.heading*` in
[`message-markdown.styles.ts`](../../src/components/ai-elements/message-markdown.styles.ts).

The sizes are `em`, not `fontSize*` tokens. The message body's size is a host
value the reader sets, so an absolute rem step would hold still while the prose
around it grew and would invert the hierarchy at the small end.

The louder half was the parser. A sentence followed immediately by `---` is a
CommonMark **setext heading**, so ordinary prose that a model followed with a
divider became an `<h2>` — the "text sometimes renders like a heading" report,
exactly. [`message-markdown.setext.ts`](../../src/components/ai-elements/message-markdown.setext.ts)
inserts the blank line that turns it back into the rule the author meant. It is
a source-text normalization rather than a remark plugin on purpose: by the time
a plugin sees the tree the heading is already built, and no `position` data
distinguishes `Title\n---` from `## Title` after the fact. Only three-or-more
dashes are rescued — a shorter underline would become an empty list item — and
fenced code, list items, blockquotes, table rows and already-separated rules
are left exactly as written.
