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

/** A surface that also owns the air between the things standing on it. */
const track = [...themeSurfaceProperties, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A pressable control whose INK is signal a brand must not be able to erase.
 *
 * `themeSurfaceProperties` minus `color`, plus its own box, focus ring and
 * type — but not `color`. Used for `RequestBar`'s method `<select>`, whose text
 * colour is the HTTP method's class (GET success, DELETE danger, …). A brand
 * may repaint its fill, edge, corner and focus ring; it may not recolour the
 * word, because the colour is the method, exactly as `breadcrumb-trail` keeps
 * its severity figure typography-only.
 */
const controlNoInk = [
  "backgroundColor",
  "backgroundImage",
  "borderBlockEndColor",
  "borderBlockStartColor",
  "borderColor",
  "borderInlineEndColor",
  "borderInlineStartColor",
  "borderRadius",
  "borderStyle",
  "borderWidth",
  "boxShadow",
  "opacity",
  ...themeTypographyProperties,
  ...themeSpaceProperties,
  ...themeFocusProperties,
] as const;

/**
 * The collaboration and agent-transcript family: activity feeds, attachments,
 * call chrome, feedback, approvals, evaluations, the request bar, reaction and
 * CSAT strips, and the message composer.
 *
 * The same shape decides target vs. slot here as everywhere else: a part with
 * its own hover/press/focus/disabled paint is its own target even inside
 * another target's box, and a static part that only ever moves with its parent
 * is a slot. Two decisions in this family are genuinely arguable and are
 * justified where they are made — `CallControlBar.Leave` (an axis on the shared
 * `button` target, not a target of its own; it is an exclusion, reported to the
 * dispatcher) and `Composer`'s split into a rung-0 root plus the field's own
 * `text-field` control.
 */
export const collabThemeTargets = {
  "activity-feed": {
    /*
     * One target, static slots. The rail (avatar/icon column), the connector
     * hairline and the day header share the feed's surface and only move with
     * it — a brand that wants a denser or recoloured feed wants one rule with
     * refinements, not four unrelated names. Nothing here is pressable, so the
     * target carries no states.
     */
    exports: ["ActivityFeed"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `ActivityFeed` renders around the event list",
    slots: {
      /* The event copy: actor·verb·target line and its timestamp. */
      body: ink,
      /*
       * The alpha rule that threads consecutive events. A hairline box, so it
       * paints a fill, a corner and its own opacity — not a `border*`.
       */
      connector: ["backgroundColor", "borderRadius", "opacity"],
      /* The uppercased day divider label. */
      day: ink,
    },
  },
  attachment: {
    axes: {
      /*
       * `status` is the file's lifecycle — `ready` / `uploading` / `error`.
       * There is no `status` axis name in the closed set, and it is spelled
       * `data-status` on this element already; reflecting it as `data-variant`
       * would be a second attribute for one fact. So no axis: the error state
       * reads from the icon ink and the meta line, not from a themeable
       * distinction on the chip, which is exactly the component's own decision
       * (the chip surface stays neutral in every state).
       */
    },
    exports: ["Attachment"],
    properties: control,
    root: "the `<div>` chip `Attachment` renders",
    slots: {
      /*
       * The lifecycle glyph. `color` is load-bearing but not signal a brand
       * must not touch — the error tint is a token a brand owns — so it takes
       * ink like every other tone glyph in the AI set.
       */
      icon: ink,
      /* Byte-size / type, or the error sentence: text inside the chip's box. */
      meta: ink,
      name: ink,
      /*
       * The dismiss control. A slot, not the `button` target, for
       * `dialog-popup`'s reason: it is a `surfaceChrome.quietIconButton`
       * square, not a `Button`, so a brand's `.ads-button` rule has never
       * reached it. It takes focus, so it gets the ring.
       */
      remove: [...surface, ...themeFocusProperties],
      /*
       * The upload progress hairline: a filled bar with a moving fill, so it
       * paints a fill and its width's colour, nothing bordered.
       */
      progress: ["backgroundColor", "opacity"],
    },
    states: ["hover", "active", "focus-visible"],
  },
  "call-control-bar": {
    /*
     * The elevated pill is a track: it owns its fill, its edge, its corner, its
     * elevation and the air between the controls standing on it. Every control
     * inside it paints its own states, so each is its own target below — the
     * bar itself enters no interactive state.
     */
    exports: ["CallControlBar"],
    properties: track,
    root: "the `role=\"group\"` `<div>` `CallControlBar` renders as the pill",
  },
  "call-control-device": {
    /*
     * The split chevron opening the device menu. A headless menu trigger with
     * its own quiet fill, hover/press wash, focus ring and disabled state — a
     * pressable element, therefore its own target. No export of its own: it is
     * reached only as `CallControlBar.Device`, a module-private part.
     */
    exports: ["CallControlBar.Device"],
    properties: control,
    root: "the headless `<button>` device-menu trigger inside the pill",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "call-control-toggle": {
    /*
     * A mic/camera/share/captions toggle. Its tone (neutral / danger /
     * highlight) is computed from `kind` + `active`, not typed as a prop, and
     * the colour is the signal — off mic reads danger, active share reads
     * accent — so there is no `tone` AXIS to reflect and the surface is
     * `control` rather than a tone-switched one: a brand recolours the tokens
     * behind the state, not the state's meaning. Pressable, so its own target.
     */
    exports: ["CallControlBar.Toggle"],
    properties: control,
    root: "the `m.button` toggle inside the pill (mic, camera, share, captions)",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  composer: {
    axes: {
      /*
       * Reflected on the rung-0 root even though the root paints nothing,
       * because the root is the only element the `toolbar`/`counter` slots are
       * reachable through, and both step with `size`. `md` is the roomier rung;
       * `lg` is deliberately unspellable (§3 caps the composer at body).
       */
      size: ["sm", "md"],
    },
    /*
     * A rung-0 root: `<form>` that draws no fill, no rule, no shadow — its
     * whole job is to stack the chip row, the field and the toolbar row. The
     * one bordered surface is the field itself, an ADS `Textarea`, already the
     * `text-field` target from the pilot family, so the composer does NOT
     * re-target the input half. What is left on the root is the air between its
     * rows and the two text slots below.
     */
    exports: ["Composer"],
    properties: [...themeSpaceProperties],
    root: "the `<form>` `Composer` renders as the rung-0 stack",
    slots: {
      /* The attached-context group above the field. */
      attachments: [...themeSpaceProperties],
      /* The mono character counter in the machine register. */
      counter: ink,
      /* The trailing action row: model select, gauge, attach button. */
      toolbar: [...themeSpaceProperties],
    },
  },
  "csat-rating": {
    axes: {
      /*
       * `size` reaches the option target's box through the group. `variant`
       * (`star` / `emoji`) is NOT reflected: the two variants differ only in
       * the glyph the option renders, whose fill is the CSAT scale — signal a
       * brand does not repaint — so a `data-variant` here would advertise a
       * distinction the themeable surface cannot act on.
       */
      size: ["sm", "md", "lg"],
    },
    /*
     * The strip: a radiogroup (or a read-only `role="img"` span) that owns only
     * the gap between the five faces. One target for the item below, one for
     * the strip — not one per emoji.
     */
    exports: ["CsatRating"],
    properties: ["columnGap", "rowGap"],
    root: "the Base UI radiogroup `<div>` (or the read-only `<span>`) `CsatRating` renders",
  },
  "csat-rating-option": {
    axes: { size: ["sm", "md", "lg"] },
    /*
     * One star or face: a radio with hover-preview fill, its own box, focus
     * ring and disabled state — pressable, so its own target, reached only as
     * a part. Its glyph fill is the CSAT ramp (signal), so the target paints
     * its box and ring, not the mark's colour: `control` minus nothing here is
     * safe because the fill lives on the inner `<svg>`, which carries no target
     * class, and the box itself is transparent.
     */
    exports: [],
    properties: [...themeSpaceProperties, ...themeFocusProperties, "borderRadius", "opacity"],
    root: "each radio `<button>` in the rating group",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  evaluation: {
    /*
     * A document section (`agentSurface.bare` — a grid and a gap). Its criteria
     * draw N−1 hairline rules rather than N boxes, and each criterion's outcome
     * reads from a `StatusDot` tone and a coloured word — signal — so the slots
     * below are text-only and the outcome colour is never a themeable surface.
     */
    exports: ["Evaluation"],
    properties: [...themeTypographyProperties, "columnGap", "rowGap"],
    root: "the `<section>` `Evaluation` renders as the evidence document",
    slots: {
      /*
       * The expected/actual comparison and the evidence excerpt are recessed
       * payload regions (`agentSurface.well`) that own their own air.
       */
      comparison: [...themeSurfaceProperties, ...themeSpaceProperties],
      description: ink,
      evidence: [...themeSurfaceProperties, ...themeSpaceProperties],
      title: ink,
    },
  },
  "evaluation-review": {
    /*
     * The optional human-judgement block, a separate `<section>` kept apart
     * from the machine evidence. It owns a top hairline and its padding; the
     * ratings themselves are a `ToggleGroup`, another component's target.
     */
    exports: ["Evaluation.Review"],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `<section>` `Evaluation.Review` wraps its `ToggleGroup` in",
  },
  "feedback-widget": {
    axes: {
      /*
       * `inline` (borderless, in-flow) vs. `panel` (bordered card). This is the
       * one distinction the root's surface actually paints, so it is reflected;
       * the thumbs are `Toggle`s and carry that component's target instead.
       */
      variant: ["inline", "panel"],
    },
    exports: ["FeedbackWidget"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `FeedbackWidget` renders",
    slots: {
      /*
       * The trust chip is a `Badge`, already its own target — not a slot here.
       * These three are the widget's own text, which the header and copy own.
       */
      copy: ink,
      meta: ink,
      title: ink,
    },
  },
  approval: {
    /*
     * A flat transcript boundary (`agentSurface.decision`): one horizontal
     * rule, no card fill and no accent edge. The decision buttons are `Button`s
     * and carry that target. The status word is the one place attention is
     * spent, and its colour is the whole signal — pending/allowed/denied — so
     * the `status` slot is typography-only, the `breadcrumb-trail` rule again:
     * a brand that could recolour it could erase the difference between allowed
     * and denied.
     */
    exports: ["Approval"],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `role=\"group\"` `<section>` `Approval` renders",
    slots: {
      /* The argument well: a recessed `label → value` payload region. */
      arguments: [...themeSurfaceProperties, ...themeSpaceProperties],
      /* Who and when, plus the free-text note. */
      audit: ink,
      description: ink,
      /*
       * Typography only. The status word switches ink between success, danger
       * and neutral to mean allowed, denied and withdrawn; that colour is the
       * record, not decoration, so it is not a themeable surface.
       */
      status: themeTypographyProperties,
      title: ink,
    },
  },
  "reaction-bar": {
    /*
     * The strip: a flex row that owns only the gap between pills. One target
     * for the pill below, one for the strip — not one per emoji.
     */
    exports: ["ReactionBar"],
    properties: ["columnGap", "rowGap"],
    root: "the `role=\"group\"` `<div>` `ReactionBar` renders",
  },
  "reaction-bar-pill": {
    /*
     * One reaction pill: a toggle button whose `reacted` state swaps to an
     * accent-soft fill with an accent border. That fill and border are tokens a
     * brand owns, so the pill takes the full `control` allowance — `reacted` is
     * not a themeable axis (it is a per-reaction boolean with no DOM spelling
     * here) but the resting and hover paint are a brand's to set. Pressable, so
     * its own target; no export of its own. The `+N` overflow pill is the same
     * class, non-interactive, so the target's states describe only the buttons.
     */
    exports: [],
    properties: control,
    root: "each reaction `<button>` pill (and the static `+N` overflow pill)",
    states: ["hover", "active", "focus-visible"],
  },
  "request-bar": {
    /*
     * The fused container: a hairline track with a `:focus-within` edge that
     * holds the method segment, the URL field and the Send button, and owns the
     * inner separators between them. The Send button is a `Button` and carries
     * that target; the two input segments paint their own states and are the
     * targets below.
     */
    exports: ["RequestBar"],
    properties: track,
    root: "the `role=\"group\"` `<div>` `RequestBar` renders as the fused bar",
  },
  "request-bar-method": {
    /*
     * The native method `<select>`. Its text colour is the HTTP method's class
     * (GET success, POST warning, DELETE danger) — signal — so it takes
     * `controlNoInk`: a brand repaints the segment's fill, edge, corner, air
     * and focus ring, but not the word's colour. Pressable, so its own target;
     * no export of its own.
     */
    exports: [],
    properties: controlNoInk,
    root: "the native method `<select>` inside the request bar",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "request-bar-url": {
    /*
     * The URL `<input>`, the `text-field` precedent's shape but with no export
     * of its own — it is a module-private segment of the bar. Its fill is the
     * track's; what it paints is its ink, its air and its focus ring.
     */
    exports: [],
    properties: control,
    root: "the URL `<input>` inside the request bar",
    states: ["focus-visible", "disabled"],
  },
  "response-meta": {
    /*
     * The response status line, a separate export from the request bar. The
     * status chip's colour is the HTTP class (2xx success … 5xx danger) —
     * signal — so the chip is typography-only, and the mono time/size readout
     * is the one text slot a brand may recolour.
     */
    exports: ["ResponseMeta"],
    properties: themeTypographyProperties,
    root: "the `<div>` `ResponseMeta` renders around the status chip and readout",
    slots: {
      /* The muted mono "123 ms · 1.2 KB" readout. */
      meta: ink,
    },
  },
} as const satisfies ThemeTargetRegistry;
