import {
  themeFocusProperties,
  themeSpaceProperties,
  themeSurfaceProperties,
  themeTypographyProperties,
} from "./theme-contract";
import type { ThemeTargetRegistry } from "./theme-target-types";

/** Paint + text, the allowance a target that owns a surface gets. */
const surface = [
  ...themeSurfaceProperties,
  ...themeTypographyProperties,
] as const;

/** A control: its surface, its own internal air, and its focus ring. */
const control = [
  ...surface,
  ...themeSpaceProperties,
  ...themeFocusProperties,
] as const;

/** A bounded surface that also owns the air its parts stand in. */
const panel = [...surface, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A part that paints nothing but the gap between its children.
 *
 * Most roots in this family are rung 0 — a bare grid or flex column that
 * stacks blocks, actions or chips with no fill, edge or type of its own. On
 * one of those the gap is the only declaration a rule could change, and it is
 * the one a brand with a tighter transcript rhythm actually reaches for.
 */
const gutter = ["columnGap", "rowGap"] as const;

/** A hairline rule: a filled 1px box, not a bordered one. */
const rule = ["backgroundColor", "borderRadius", "opacity"] as const;

/**
 * The AI-surface family: a streamed answer, its reasoning, its tool calls, its
 * plan, its artifacts, and the thread they live in.
 *
 * Two shapes recur across the whole family and decide nearly every call below.
 *
 * **Rung 0 is a bare surface, so most roots carry type and gap, not a box.**
 * `decisions/agent-surface-grammar.md` §1 forbids a perimeter on a transcript
 * step: `Stream`, `Thinking`, `ToolRun`, `Plan`, `Thread` and their parts draw
 * no fill and no edge, and are legible because they are language on the canvas.
 * A root like that lists the ink and typography it sets on the prose it holds,
 * plus the `columnGap`/`rowGap` that is its only spacing — never `padding` or a
 * `border*`, because it paints neither. The two surfaces that DO spend a
 * perimeter are named for it: the user's `bubble` (rung 4) and the detachable
 * `artifact` tile (rung 5).
 *
 * **A disclosure is a bare container plus a pressable trigger.** `Thinking`
 * and `ToolRun` render a static row when there is nothing to open and a
 * `Collapsible` trigger + panel when there is. Only a TARGET carries states,
 * and the trigger is the one element with its own hover/press/focus/disabled
 * paint (`inlineDisclosure` + `transition.colors`), so it is its own target
 * even though it has no export of its own — the shape `accordion-trigger` and
 * `collapsible-trigger` already established in the tabs family. The container
 * target covers the public export and reflects nothing a slot cannot reach.
 */
export const agenticThemeTargets = {
  "action-swap": {
    exports: ["ActionSwap"],
    /*
     * Ink only. The swap is Motion's `transform` on the inner span, and this
     * root is a `display: inline-flex` clipping window with no paint of its
     * own — the label's colour and weight are the whole allowance, and both
     * land on whatever content is being swapped in and out.
     */
    properties: ink,
    root: "the `<span>` wrapping the two swapping labels",
  },
  artifact: {
    /*
     * One target, nine slots — the `card` precedent exactly. The parts share
     * the tile's one perimeter (`agentSurface.tile`, rung 5) and only ever
     * move with it, so a brand that wants a different artifact wants one rule
     * with refinements, not nine unrelated names. `header`, `content` and
     * `preview` own their own box (they set padding and a divider), so they
     * take the space group; the copy parts are ink; `actions` owns only the
     * air between its buttons.
     */
    exports: [
      "Artifact",
      "Artifact.Actions",
      "Artifact.Content",
      "Artifact.Description",
      "Artifact.Header",
      "Artifact.Meta",
      "Artifact.Preview",
      "Artifact.Root",
      "Artifact.Status",
      "Artifact.Title",
    ],
    properties: panel,
    root: "the `<section>` `Artifact.Root` renders",
    slots: {
      actions: [...themeSpaceProperties],
      content: [...surface, ...themeSpaceProperties],
      description: ink,
      header: [...surface, ...themeSpaceProperties],
      meta: ink,
      preview: [...surface, ...themeSpaceProperties],
      /*
       * The one-word run state. Typography and `opacity` only — its colour is
       * the danger/success/accent signal that distinguishes "Failed" from
       * "Complete", and a brand that could recolour it could erase the
       * distinction (the `breadcrumb-trail` rule in the tabs family).
       */
      status: themeTypographyProperties,
      title: ink,
    },
  },
  checkpoint: {
    /*
     * A separator with an action, not a card: two hairline rules flank the
     * label and the whole thing draws no fill (`decisions/…` §7). The root is
     * the grid that owns the column gap and the block padding those rules sit
     * in; the rules themselves are the `rule` slot, and the copy is ink.
     */
    exports: ["Checkpoint"],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `role=\"group\"` `<div>` `Checkpoint` renders",
    slots: {
      description: ink,
      /*
       * The flanking hairlines. A filled box, not a bordered one — but here
       * the rule is drawn with `border-block-start`, so the brand reaches it
       * through the border longhands the surface group already carries; the
       * slot keeps `borderRadius`/`opacity` off because a hairline has neither.
       */
      rule: ["borderBlockStartColor", "borderStyle", "borderWidth", "opacity"],
      title: ink,
    },
  },
  clarification: {
    /*
     * A flat human-decision boundary (`agentSurface.decision`): one top
     * hairline, explicit status text, no card fill and no accent edge. The
     * root owns that rule and the block air; the fields and audit well inside
     * it are the caller's ADS form controls, which carry their own targets.
     */
    exports: ["Clarification"],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `role=\"group\"` `<section>` `Clarification` renders",
    slots: {
      description: ink,
      /*
       * The resolved-outcome word. Typography and `opacity` only, for the
       * `artifact` `status` reason: warning/success/neutral ink is the signal
       * that says "answered" from "withdrawn", and it is not a brand's to flatten.
       */
      status: themeTypographyProperties,
      title: ink,
    },
  },
  plan: {
    /*
     * Rung 3 — the step list is `agentSurface.rowGroup`, N steps drawing N−1
     * hairlines and zero boxes, and the plan root itself is bare. The root
     * carries the header/list ink and its row gap; the per-step boundary rule
     * belongs to the group, not to a slot a brand could delete.
     */
    exports: ["Plan"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `role=\"group\"` `<section>` `Plan` renders",
    slots: {
      /* The step's sentence, and the machine value beside it. */
      meta: ink,
      title: ink,
    },
  },
  "plan-status-mark": {
    /*
     * The 16px morphing mark on each step row, its own export (`PlanStatusMark`).
     * `color` and `opacity` only, and that is the honest list: the ring and the
     * check/cross/alert overlays all stroke `currentColor`, so the slot's ink
     * IS the whole mark's hue — but that hue is the pending→approval→done→failed
     * SIGNAL, so it is deliberately not offered. What is left a brand may set is
     * `opacity`; the mark's motion is untouched.
     */
    exports: ["PlanStatusMark"],
    properties: ["opacity"],
    root: "the `<span>` wrapping the status mark `<svg>` (or the `Loader` while running)",
  },
  stream: {
    /*
     * The streamed answer, rung 0: no card, no border, no fill — the output is
     * the document. The root sets the prose colour, size and relaxed leading
     * every block inherits, and owns no box. `data-stream-status` stays a plain
     * data attribute, not an axis: `complete`/`error`/`streaming` is a lifecycle
     * state, and none of the four axes names it.
     */
    exports: ["Stream", "Stream.Actions", "Stream.Block", "StreamBlockContent"],
    properties: surface,
    root: "the `<div>` `Stream` renders around the response",
    slots: {
      /*
       * The completion-actions row. It owns only the air between its buttons —
       * the buttons are `CopyButton`/`AgentRetryButton`, their own targets —
       * so the gap group, not a fill it does not draw.
       */
      actions: [...themeSpaceProperties],
      /* One reveal unit. The opacity animation lands on this element; a slot
       * touches its ink and gap, never that animation. */
      block: ink,
      /* The default paragraph/list/code renderer. Ink inside the stream's box. */
      content: ink,
    },
  },
  suggestions: {
    /*
     * Follow-up chips at the live edge. The chips are ADS `Button`s (their own
     * target) inside a roving `Toolbar`; this root is only the wrapping flex
     * row, so the gap between chips is the whole allowance. Reflected on both
     * render paths — the loading `<div>` of skeletons and the `Toolbar` of
     * chips — so a brand's rule survives the swap.
     */
    exports: ["Suggestions"],
    properties: gutter,
    root: "the `<div>`/`role=\"toolbar\"` row `Suggestions` renders (loading and loaded paths)",
  },
  thinking: {
    /*
     * Transient reasoning, rung 2: a compact row and a low-contrast trace, no
     * perimeter. The container carries the label/trace ink and the row gap; the
     * pressable disclosure header is `thinking-trigger` below, because only a
     * target takes states and the trigger is where the hover/focus paint is.
     * `data-thinking-status` is a lifecycle attribute (`settled`/`thinking`),
     * not one of the four axes.
     */
    exports: ["Thinking"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the outer `<div>` `Thinking` renders — the static row, or the collapsible root",
    slots: {
      /* The reasoning trace body, when a trace is present. Muted prose. */
      trace: ink,
    },
  },
  "thinking-trigger": {
    /*
     * The disclosure header `<button>`. No export of its own — it exists only
     * when a trace is present — but it is its own target because it is the one
     * element in `Thinking` with hover/press/focus/disabled paint, and only a
     * target carries states.
     */
    exports: [],
    properties: control,
    root: "the `<button>` Base UI's collapsible trigger renders inside `Thinking`",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  thread: {
    /*
     * The transcript viewport, rung 0: no perimeter, no fill. It contributes
     * the reading measure and the scroll container and nothing paintable but
     * its own text ink and the turn-to-turn gap. The jump-to-latest control is
     * a `Button` (its own target); the divider and turn are targets below.
     */
    exports: ["Thread"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `Thread` renders as the scroll viewport",
  },
  "thread-divider": {
    /*
     * A labelled break: a centred label between two flanking hairlines. The
     * root owns the column gap; the label is ink and the rules are the `rule`
     * slot — a filled 1px box, drawn with `background-color` here.
     */
    exports: ["ThreadDivider", "Thread.Divider"],
    properties: gutter,
    root: "the `<div>` `ThreadDivider` renders",
    slots: { label: ink, rule },
  },
  "thread-item": {
    /*
     * A stable identity and focus target for any transcript row. It adds no
     * visual chrome of its own beyond the focus ring it can show, so the honest
     * allowance is the ring plus `borderRadius`/`opacity` — no fill, no type,
     * because the row it wraps owns those.
     */
    exports: ["ThreadItem", "Thread.Item"],
    properties: ["borderRadius", "opacity", ...themeFocusProperties],
    root: "the `<div>` `ThreadItem` renders",
    states: ["focus-visible"],
  },
  "thread-turn": {
    /*
     * One participant's turn. `role` is reflected because the containment rung
     * is a function of it and nothing else: `user` is the family's only filled
     * bubble (rung 4), `agent`/`peer` are bare text, `system` is bare one ink
     * step down. The brand needs the axis to paint the bubble without touching
     * the three bare roles — so it is reflected even though the `<article>`
     * itself paints only through the body slot below it.
     *
     * `tone` is the spelling, not `variant`: the value IS the role vocabulary
     * (`user`/`agent`/`peer`/`system`), and calling it `variant` would invent a
     * second name for the distinction the DOM already draws as `data-turn-role`.
     * The class carries `data-tone`; `data-turn-role` stays for Base UI-style
     * behaviour and the two say the same thing.
     */
    axes: { tone: ["user", "agent", "peer", "system"] },
    exports: ["Thread.Turn"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<article>` `Thread.Turn` renders",
    slots: {
      /* The author name on the metadata line. */
      author: ink,
      /*
       * The turn's content plane. This is where the `user` bubble's fill and
       * radius actually live (`agentSurface.bubble`), so it takes the full
       * surface + space allowance; for the bare roles it paints nothing and a
       * rule there simply does not fire.
       */
      body: [...surface, ...themeSpaceProperties],
      /* Delivery-state word ("Read", "Sent"). Ink, in the proportional face. */
      receipt: ink,
    },
  },
  "thread-empty-state": {
    /*
     * The blank slate. It renders an ADS `EmptyState` (`variant="plain"`),
     * whose surface is that component's own target — so this wrapper adds no
     * paint and gets ink only, the honest allowance for a component that
     * delegates its box.
     */
    exports: ["ThreadEmptyState", "Thread.EmptyState"],
    properties: ink,
    root: "the `EmptyState` `ThreadEmptyState` renders",
  },
  "tool-run": {
    /*
     * One tool invocation, rung 0: a text row, not a card. The container
     * carries the payload ink and its gaps; the pressable summary header is
     * `tool-run-trigger` below. `data-tool-run-status` is a lifecycle
     * attribute, not an axis.
     */
    exports: ["ToolRun", "ToolRunSection", "ToolRunSummary"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the outer `<div>` `ToolRun` renders — the static row, or the collapsible root",
    slots: {
      /*
       * A payload block (arguments, output, an error tail). It takes a semantic
       * wash on the danger branch, so it owns surface + air; the `title`,
       * `tool` name and `count`/duration on the summary line are ink and the
       * machine register, addressable as the summary slots.
       */
      section: [...surface, ...themeSpaceProperties],
      status: themeTypographyProperties,
      summary: ink,
    },
  },
  "tool-run-trigger": {
    exports: [],
    properties: control,
    root: "the `<button>` Base UI's collapsible trigger renders inside `ToolRun`",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "tool-run-group": {
    /*
     * A run of sibling rows, rung 3. The container is bare and carries the
     * group's row ink and gap; its optional roll-up header is a pressable
     * trigger (`tool-run-group-trigger`). Reflected on both render paths — the
     * bare list container and the collapsible root — so a brand's rule holds
     * whether or not the group rolls up.
     */
    exports: ["ToolRunGroup", "ToolRun.Group"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the outer `<div>` `ToolRunGroup` renders — the bare list, or the collapsible root",
  },
  "tool-run-group-trigger": {
    exports: [],
    properties: control,
    root: "the `<button>` Base UI's collapsible trigger renders for a rolled-up `ToolRunGroup`",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
