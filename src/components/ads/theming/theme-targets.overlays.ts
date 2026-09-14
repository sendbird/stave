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

/** A surface that also owns the air inside it. */
const panel = [...surface, ...themeSpaceProperties] as const;

/** A control: its surface, its own internal air, and its focus ring. */
const control = [...panel, ...themeFocusProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/** A part that only owns the air inside its parent's surface. */
const air = [...themeSpaceProperties] as const;

/**
 * A modal scrim. One flat wash and nothing else: it has no edge, no text and
 * no box, so anything else in the vocabulary would generate a rule that
 * changes no pixel.
 */
const scrim = ["backgroundColor", "backgroundImage", "opacity"] as const;

/**
 * The overlay family: the surfaces that float over a page, plus the review and
 * call surfaces that share their anatomy.
 *
 * Two shapes recur here and both come from the pilot. A portalled compound
 * whose scrim and panel paint separately publishes one target per painted
 * element (`dialog-popup` / `dialog-backdrop`), and its dismiss control is a
 * SLOT rather than the `button` target, because every one of these hand-rolls
 * a quiet icon square out of `surfaceChrome` and a brand's `.ads-button` rule
 * has never reached it. A surface whose parts only ever move with it publishes
 * one target and reaches its rows through slots (`card`).
 *
 * The docked edge of a drawer, the open/closed phase of every popup, and a
 * positioner's resolved side are absent by construction: `side`, `open`,
 * `closed` and `starting-style` are `reservedStateAttributes`, published by
 * Base UI on the same elements ADS styles here.
 */
export const overlaysThemeTargets = {
  "alert-dialog-backdrop": {
    exports: [],
    properties: scrim,
    root: "the Base UI alert-dialog backdrop element",
  },
  "alert-dialog-popup": {
    axes: {
      density: ["compact", "regular"],
      /*
       * The confirm's severity, and the only axis a brand actually needs here:
       * `tone` already decides the header chip and both footer buttons, so a
       * destructive confirm that must read differently from an ordinary one is
       * one refinement instead of a second component.
       */
      tone: ["danger", "neutral"],
    },
    exports: ["AlertDialog"],
    properties: panel,
    root: "the Base UI alert-dialog popup element",
    slots: {
      body: [...ink, ...air],
      description: ink,
      /* The inline failure from a rejected `onConfirm`, which owns a box. */
      error: [...surface, ...air],
      footer: air,
      header: air,
      title: ink,
    },
  },
  "annotation-layer": {
    exports: ["AnnotationLayer"],
    properties: [...surface, ...themeFocusProperties],
    root: 'the `<div role="group">` `AnnotationLayer` renders around the artifact',
    slots: {
      /* The keyboard placement cursor — a marker-sized preview of a pin. */
      ghost: [...surface],
    },
    states: ["focus-visible"],
  },
  "annotation-pin": {
    axes: {
      /*
       * `AnnotationPin` spells this axis `state`, which is not one of the four
       * axis names and could not become one — `state` is what Base UI's own
       * `data-state` means everywhere else in the system. The three values are
       * exactly a tone ledger (subtle draft, accent open, success resolved), so
       * they reflect as `tone` with the prop's own strings. Without the axis a
       * brand could restyle a pin but not a RESOLVED pin, which is the only
       * distinction the marker exists to draw.
       */
      tone: ["draft", "open", "resolved"],
    },
    exports: ["AnnotationPin"],
    properties: control,
    root: "the `<button>` `AnnotationPin` renders through Motion",
    states: ["hover", "active", "focus-visible"],
  },
  "audio-player": {
    exports: ["AudioPlayer"],
    properties: panel,
    root: 'the `<div role="group">` `AudioPlayer` renders',
    slots: {
      time: ink,
      /*
       * The scrubber, not the waveform: the bars are `fill`ed per frame from
       * the played fraction, so their ink is data and stays with the component.
       * What a brand can restyle is the box that takes focus around them.
       */
      wave: [...surface, ...themeFocusProperties],
    },
  },
  "comment-thread": {
    axes: { variant: ["bare", "panel"] },
    exports: ["CommentThread"],
    properties: panel,
    root: "the `<section>` `CommentThread` renders",
    slots: {
      author: ink,
      composer: air,
      empty: ink,
      header: air,
      text: ink,
      timestamp: ink,
      title: ink,
    },
  },
  "drawer-backdrop": {
    exports: [],
    properties: scrim,
    root: "the Base UI drawer backdrop element",
  },
  "drawer-popup": {
    axes: {
      density: ["compact", "regular"],
      /* The panel-measure axis on the docked edge, which `Drawer` spells `width`. */
      size: ["sm", "md", "lg", "full"],
    },
    exports: ["Drawer"],
    properties: panel,
    root: "the Base UI drawer popup element",
    slots: {
      body: [...ink, ...air],
      close: [...surface, ...themeFocusProperties],
      content: air,
      description: ink,
      header: air,
      title: ink,
    },
  },
  frame: {
    axes: {
      density: ["compact", "regular"],
      variant: ["default", "subtle", "inset"],
    },
    /*
     * One target, five slots — the `card` answer, for the same reason. A
     * Frame's rows share its bordered well and only ever move with it, so a
     * brand that wants a different Frame wants one rule with five refinements,
     * not six targets whose relationship it has to reconstruct.
     */
    exports: [
      "Frame",
      "FrameBody",
      "FrameDescription",
      "FrameFooter",
      "FrameHeader",
      "FrameTitle",
    ],
    properties: panel,
    root: "the `<section>` `Frame` renders",
    slots: {
      body: [...ink, ...air],
      description: ink,
      footer: [...surface, ...air],
      header: [...surface, ...air],
      title: ink,
    },
  },
  "full-screen-modal": {
    exports: ["FullScreenModal"],
    /*
     * No space group: the panel is `inset: 0` and pays no padding of its own —
     * its top bar and body each pay their own — so a padding rule here would
     * be a generated rule that changes no pixel.
     */
    properties: surface,
    root: "the Base UI dialog popup element `FullScreenModal` renders",
    slots: {
      actions: air,
      body: air,
      lead: air,
      title: ink,
      topbar: [...surface, ...air],
    },
  },
  "inspector-panel": {
    axes: {
      density: ["compact", "regular"],
      variant: ["flat", "panel"],
    },
    exports: ["InspectorPanel"],
    properties: surface,
    root: "the `<aside>` `InspectorPanel` renders",
    slots: {
      actions: air,
      body: [...ink, ...air],
      description: ink,
      footer: [...surface, ...air],
      header: [...surface, ...air],
      title: ink,
    },
  },
  lightbox: {
    exports: ["Lightbox"],
    properties: surface,
    root: "the Base UI dialog popup element `Lightbox` renders",
    slots: {
      caption: [...surface, ...air],
      counter: ink,
      header: air,
      /* The media well behind the image, whose fill is what the media sits on. */
      stage: [...surface, ...air],
      title: ink,
      toolbar: [...surface, ...air],
    },
  },
  "lightbox-backdrop": {
    exports: [],
    properties: scrim,
    root: "the Base UI dialog backdrop element `Lightbox` renders",
  },
  "live-cursors": {
    exports: ["LiveCursors"],
    /*
     * Empty on purpose, and the one target in this family that is a slot scope
     * rather than a surface. The overlay is a transparent layer over content
     * the caller owns; every pixel it paints of its own is the name plate
     * below, and a fill on the layer would cover the surface it exists to
     * annotate. The identity hue on the glyph and the dot is per-cursor data,
     * written inline from the presence channel, so it is not themeable either.
     */
    properties: [],
    root: "the `<div>` `LiveCursors` wraps the annotated surface in",
    slots: { label: [...surface, ...air] },
  },
  "live-waveform": {
    exports: ["LiveWaveform"],
    /* The comb's own box paints nothing but the air between bars. */
    properties: air,
    root: 'the `<div role="img">` `LiveWaveform` renders',
    slots: {
      /*
       * Resting ink and shape only. Bar HEIGHT is the mic level and bar accent
       * is the speaking state, both written per frame; a brand that could set
       * them would be overwriting the reading.
       */
      bar: ["backgroundColor", "borderRadius"],
    },
  },
  "peek-panel": {
    /*
     * No axis. `dock` is the only thing that varies and it is pure geometry —
     * which containing block the panel docks to and whether the content
     * narrows — so there is nothing for a brand to paint differently per value.
     */
    exports: ["PeekPanel"],
    properties: surface,
    root: "the `<aside>` `PeekPanel` renders",
    slots: {
      actions: air,
      body: [...ink, ...air],
      header: [...surface, ...air],
      title: ink,
    },
  },
  "popover-popup": {
    axes: { density: ["compact", "flush", "regular"] },
    exports: ["Popover"],
    properties: panel,
    root: "the Base UI popover popup element",
    slots: {
      /*
       * Base UI's arrow fills from `currentColor`, so `color` is the whole
       * allowance — it is the one declaration that keeps the tail matching a
       * repainted panel.
       */
      arrow: ["color"],
      body: [...ink, ...air],
      close: [...surface, ...themeFocusProperties],
      description: ink,
      header: air,
      title: ink,
    },
  },
  "popover-trigger": {
    /* `Popover` spells this axis `triggerSize`; the values are its own. */
    axes: { size: ["sm", "md", "lg"] },
    exports: [],
    /*
     * A separate target rather than a slot of the popup: the trigger stays in
     * the provider's tree while the popup portals out of it, so it is not a
     * descendant of the popup's class and no slot selector could reach it.
     *
     * No focus group. The trigger carries focus on its BORDER
     * (`focusRing.borderOnly`), so its ring is `borderColor` under the
     * `focus-visible` state; an outline allowance would paint a second
     * indicator over the first.
     */
    properties: panel,
    root: "the Base UI popover trigger element `Popover` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "preview-card": {
    exports: ["PreviewCard"],
    /*
     * No space group: the popup's padding belongs to its `content` row, which
     * is what lets the arrow paint outside the popup's border box.
     */
    properties: surface,
    root: "the Base UI preview-card popup element",
    slots: {
      arrow: ["color"],
      body: [...ink, ...air],
      content: air,
      description: ink,
      meta: ink,
      title: ink,
    },
  },
  tooltip: {
    /*
     * One target for both exports. `Tooltip` and `TooltipIconButton` render the
     * same popup — the second only adds a `Button` trigger, which already
     * carries `.ads-button` — so a brand that restyles a hint restyles both.
     */
    exports: ["Tooltip", "TooltipIconButton"],
    properties: panel,
    root: "the Base UI tooltip popup element",
    slots: { arrow: ["color"], content: air },
  },
  "video-grid": {
    /*
     * The grid paints no surface at all: a tile's frame is `video-tile`'s, and
     * the track sizes are layout, which stays with the host. What is left, and
     * the whole honest allowance, is the air between tiles.
     */
    exports: ["VideoGrid"],
    properties: air,
    root: "the `<div>` `VideoGrid` renders",
    slots: { rail: air },
  },
  "video-tile": {
    /*
     * `VideoTile` spells this axis `emphasis`, and its own doc calls it the
     * rendered size tier: the stage tile steps its name plate and glyphs up
     * because it renders several times the filmstrip tile's width.
     */
    axes: { size: ["stage", "tile"] },
    exports: ["VideoTile"],
    properties: surface,
    root: 'the `<div role="group">` `VideoTile` renders',
    slots: {
      name: ink,
      pin: [...surface, ...air],
      /* The name plate: the one chip that has to read on arbitrary video. */
      plate: [...surface, ...air],
      /*
       * The active-speaker ring, border longhands only. It is an inset overlay
       * with nothing behind it, so a fill would black out the media, and its
       * opacity is the pulse.
       */
      ring: ["borderColor", "borderRadius", "borderStyle", "borderWidth"],
    },
  },
} as const satisfies ThemeTargetRegistry;
