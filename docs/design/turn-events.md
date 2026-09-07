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
| todo / plan              | host `ChainOfThoughtStep`    | ADS `Plan` is not installed in this copy — see §7                            |
| approval                 | host `ChainOfThoughtStep`    | ADS `Approval` is not installed — see §7                                     |
| user input               | host `ChainOfThoughtStep`    | ADS `Clarification` is not installed — see §7                                |
| system                   | host `ChainOfThoughtStep`    | first non-empty line is the title; the rest is the body                       |
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
| label       | `fontSizeBody` + `fontWeightMedium`, `colorText`      | `ToolRun` `title` / `Thinking` `phase` |
| status word | `fontSizeCaption`, one `agentStatusWord` tone         | `ToolRun`, from `AgentRunState`        |
| target      | `agentSurface.meta` (mono, `tabular-nums`, `colorTextSubtle`) | `ToolRun` `tool`              |
| count       | `agentSurface.meta`                                   | `ToolRun` `count`                      |
| duration    | `agentSurface.meta`                                   | measured only — §4                     |
| chevron     | replaces the glyph on hover and focus-visible         | `inline-disclosure-motion.css`         |
| body        | `inlineDisclosure.body` tint (rung 4)                 | `ToolRun` sections / `Thinking` trace  |

The status mark and the chevron share one slot on purpose. One leading mark per
row is the whole anatomy; a second mark out on the rail restates a status the
row's own spinner, colored word and ink already carry.

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
| `input-streaming`           | `running`       | Running, accent    | open, live clock                |
| `input-available`           | `running`       | Running, accent    | open, live clock                |
| `output-available`          | `done`          | Completed, success | auto-collapses to its record    |
| `output-error`              | `failed`        | Failed, danger     | **stays open**                  |
| approval requested          | `approval`      | Awaiting approval  | **stays open**                  |
| interrupted / canceled turn | `interrupted` / `canceled` | warning / neutral | closed             |

Rules, all owned by ADS `useSettleDisclosure` and `isAttentionState` — do not
re-derive them per call site:

1. **Open while live.** A running payload is the thing the reader is watching.
2. **Auto-collapse on completion.** A clean result collapses to one measured
   line. Only a clean result: a failure, denial or approval gate counts as live
   for the disclosure, because collapsing it would hide the one payload worth
   reading the instant it appeared.
3. **The reader outranks the automation.** Toggling a row during a run switches
   auto-collapse off for that run.
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
| turn-trigger chevron + ink | `motionDurationQuick`, `motionEaseStandard`            |
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

## 8. Kinds still rendered by the host

`todo`, `approval`, `user input` and `system` render through the host
[`ChainOfThoughtStep`](../../src/components/ai-elements/chain-of-thought.tsx),
which is itself a `StepRail.Step`, so they share the rail, the gutter and the
row rhythm with the ADS rows beside them.

They are **not** forced onto `ToolRun`. ADS has purpose-built surfaces for
three of them — `Plan`, `Approval`, `Clarification` — and calling a human
decision a "tool call" would be exactly the two-names-for-one-state bug the
shared `AgentRunState` exists to prevent. Adopting them is a follow-up: install
those components into
[`src/components/ads`](../../src/components/ads/PROVENANCE.md) and move the
kinds over one at a time.

`ToolRun.Group` is likewise not used yet. The trace's grouping axis is
adjacency *within* a step — reasoning parts, diff parts — not runs of sibling
tool calls, and the rail already provides the rung-2 grouping that a
non-rolled-up group would.
