import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Surface roles for agent/AI work surfaces.
 *
 * Ten AI composites had independently converged on the same root — a
 * `colorSurfaceRaised` fill, a `borderWidthHairline` outline, `radiusPanel`,
 * and `space3` padding. Stacked in a real transcript that reads as a column of
 * identical cards, and nesting two of them (a reasoning trace holding a tool
 * call holding an output block) pushed the concentric-border count to four,
 * over the ceiling of three in `design-direction.md` §1.3.
 *
 * A card is not the only way to say "this is a thing". These five roles name
 * the four cheaper ways plus the one case where a card is still right, so the
 * choice is made once here instead of re-derived per component:
 *
 * - `row` — no fill, no outline. A hover wash and padding are the whole
 *   surface. The default for a repeated agent step.
 * - `rowGroup` — a container that separates its own children with a hairline.
 *   The line belongs to the list, not to each item, so N rows draw N-1 lines
 *   instead of N boxes.
 * - `decision` — a flat transcript boundary for approval and clarification.
 *   Explicit status text carries the state; no card fill or accent edge is used.
 * - `tile` — the one surviving bordered card, for a genuinely detachable
 *   artifact (a file, a preview) that a user would drag or open elsewhere.
 * - `panel` — one bounded workspace that owns navigation and one active body.
 *   Unlike `tile`, it supplies no padding; its header/body regions own it.
 * - `bare` — a grid and a gap. For a composite root whose only job is to
 *   stack children; the children carry whatever chrome is needed.
 *
 * Every role is padding/edge only. Color of *content*, typography, and state
 * still belong to the component.
 */
export const agentSurface = stylex.create({
  /**
   * A single agent step. No border and no fill at rest — the row is legible
   * because of its own padding and the rule above it, not because it is boxed.
   */
  row: {
    borderRadius: vars.radiusControl,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  /**
   * Hover/press wash for an interactive `row`. Split from `row` so a static
   * row does not advertise an affordance it does not have.
   */
  rowInteractive: {
    backgroundColor: {
      default: "transparent",
      ":active": vars.colorOverlayPressed,
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars.colorOverlayPressed,
        ":hover": vars.colorOverlayHover,
      },
    },
    cursor: "pointer",
  },
  /**
   * Container for a run of `row`s. The separator is a child-boundary rule, so
   * the group never draws an outer box and the first row has no line above it.
   */
  rowGroup: {
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  /**
   * The per-child rule of a `rowGroup`. Applied to every child *except* the
   * first, which is why it is a separate key rather than a `:not(:first-child)`
   * inside `rowGroup` — StyleX cannot address descendants.
   */
  rowGroupItem: {
    borderBlockStartColor: vars.colorBorderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
  },
  rowGroupItemFirst: {
    borderBlockStartWidth: 0,
  },
  /**
   * A state-bearing human-decision boundary. The visible status word and action
   * set already name pending / approved / rejected, so a colored edge would
   * repeat state as the familiar side-tab pattern. One horizontal rule locates
   * the decision in transcript flow without turning it into a tinted card.
   */
  decision: {
    borderBlockStartColor: vars.colorBorderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    borderRadius: 0,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: vars.space12,
    paddingInline: 0,
  },
  /**
   * The one bordered card left in the AI set: a detachable artifact. Keeping
   * the name explicit makes the border count auditable — grep `agentSurface.tile`
   * and you have every AI surface that spends a line.
   *
   * **The perimeter is the contract; the box is not.** A tile may override the
   * geometry keys below — `display`, `inlineSize`, `padding`, `gap`, even
   * `borderRadius` — while keeping the fill and the hairline. `Attachment` is
   * the worked example: it is a genuinely detachable artifact and so belongs
   * here, but it renders as an inline chip, and forcing the full-width grid box
   * on it would make the component heavier, which is the opposite of the point.
   * Read this key as "spends a line, and is registered as spending one", not as
   * "is a block card".
   */
  tile: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
    padding: vars.space12,
  },
  /**
   * One bounded AI workspace. A panel may contain tabs, rows, and a footer, so
   * it owns exactly one outer perimeter and lets those regions spend only
   * directional dividers. No elevation: it is stationary, not pressable.
   */
  panel: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
  },
  /**
   * A composite root that only stacks children. No fill, no line, no padding —
   * so nesting one composite inside another adds zero concentric borders.
   */
  bare: {
    color: vars.colorText,
    display: "grid",
    gap: vars.space12,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  /**
   * Recessed content inside a row or decision boundary (arguments, output, a
   * log tail). A temperature step, never an outline — §1.3's answer to "this
   * is nested".
   */
  well: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusControl,
    boxSizing: "border-box",
    display: "grid",
    gap: vars.space8,
    minInlineSize: 0,
    padding: vars.space12,
  },
  /**
   * The **machine register**: a value the agent produced or measured, rather
   * than language it wrote. Token counts, elapsed times, model ids, tool
   * names, commit sha's, file paths, "12 of 48".
   *
   * Monospaced with tabular figures, one ink step below body. Two reasons this
   * is a role and not a per-component choice:
   *
   * 1. **It is a free hierarchy axis.** An agent surface is dense and cannot
   *    spend a size jump or a box on every distinction. Splitting human
   *    language (proportional) from machine values (mono) separates the two
   *    registers at a glance with no extra chrome — which is precisely the
   *    chrome the flat surface roles above are trying not to spend.
   * 2. **Tabular figures stop the jitter.** These values update live. With
   *    proportional digits a ticking elapsed time or a climbing token count
   *    changes width on almost every frame, dragging the rest of the row with
   *    it. `tabular-nums` fixes the advance width so a counter animates in
   *    place — the same layout-stability rule the streaming reveal follows.
   *
   * Do not use it for prose the model wrote. Mono on a sentence reads as a
   * code block and undoes the split it exists to create.
   */
  meta: {
    color: vars.colorTextSubtle,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
  },
  /**
   * `label … value` on one line: label left in body ink, value hard right in
   * the machine register, nothing drawn between them. The flexible cell is the
   * label, so a long label truncates and the value — the part that carries the
   * information — is never the thing that gets cut.
   *
   * This is what lets a dense stack of key/value rows stay scannable without
   * grid lines, and it is why the AI set needs no two-column table primitive.
   */
  metaRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space12,
    inlineSize: "100%",
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  /** The truncating cell of a `metaRow`. */
  metaRowLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * Secondary affordances — copy, retry, replay, open — at rest.
   *
   * They sit at zero opacity and ignore pointer hit-testing so a resting
   * transcript is text and rules, not a column of buttons. They deliberately
   * stay in the accessibility tree and tab order: keyboard focus on the first
   * action triggers the owner's `focus-within` state and reveals the whole
   * group before the control is painted focused. Pair with `transition.fade`
   * and flip to `quietActionsRevealed` from the owning row's hover/focus state.
   */
  quietActions: {
    opacity: {
      default: 0,
      "@media (hover: none), (pointer: coarse), (any-pointer: coarse)": 1,
    },
    pointerEvents: {
      default: "none",
      "@media (hover: none), (pointer: coarse), (any-pointer: coarse)": "auto",
    },
  },
  quietActionsRevealed: {
    opacity: 1,
    pointerEvents: "auto",
  },
  /**
   * Rung 1 of the containment ladder: a payload that belongs to the row above
   * it, held by inset alone with no ink at all. Cheaper than `spine`, which
   * spends a hairline; reach for this first and add the rule only when the
   * payload is long enough that the eye loses the column.
   *
   * See `decisions/agent-surface-grammar.md` §1.
   */
  indent: {
    display: "grid",
    gap: vars.space8,
    marginInlineStart: vars.space24,
    minInlineSize: 0,
  },
  /**
   * The user's turn — **the only filled bubble in the family.**
   *
   * The asymmetry is deliberate and is most of why the surface stops reading as
   * a chat toy: the person's input is a discrete thing they authored and can
   * point at, so it gets a shape; the agent's output is the document itself and
   * gets none. Inverting this — bubbling the agent, or bubbling both — is what
   * produces the two-column messenger look this family exists to avoid.
   *
   * A tint (rung 4), never a stroke, and `radiusPanel` because it contains
   * language rather than acting like a control.
   */
  bubble: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusPanel,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "grid",
    gap: vars.space8,
    minInlineSize: 0,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  /**
   * The transcript's reading measure.
   *
   * Agent output is prose, and prose set to the full width of an app frame is
   * unreadable — which is the second reason people reach for cards, to break up
   * a line length they should have constrained instead. Applied by `Thread` to
   * its own column so every child inherits it without each one re-deciding.
   */
  measure: {
    inlineSize: "100%",
    marginInline: "auto",
    maxInlineSize: "68ch",
    minInlineSize: 0,
  },
});

/**
 * A one-word status, tinted and never bordered.
 *
 * The old set said "running" with a bordered pill inside a bordered header
 * inside a bordered card — three perimeters for one word. A colored word
 * carries the same information at rung 0. Keyed by semantic weight so a
 * component maps its own vocabulary on without this recipe importing a state
 * union.
 */
export const agentStatusWord = stylex.create({
  neutral: { color: vars.colorTextSubtle },
  accent: { color: vars.colorAccent },
  success: { color: vars.colorSuccess },
  warning: { color: vars.colorWarning },
  danger: { color: vars.colorDanger },
});
