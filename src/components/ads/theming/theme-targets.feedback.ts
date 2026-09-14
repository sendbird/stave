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

/** A notice: its surface plus the internal air of its own box. */
const notice = [...surface, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A tone glyph. Only `color`, because that is all a semantic icon paints —
 * the family's decision that tone reads from the mark and never from a wash.
 */
const glyph = ["color", "opacity"] as const;

/**
 * The feedback family: notices, empty states, toasts, and the two loading
 * placeholders.
 *
 * This is where `tone` stops being decoration and starts being the axis a
 * brand actually switches on — every notice here says "info / success /
 * warning / danger" in its own words, and the values below are those words
 * verbatim. `Callout` still carries a sixth (`accent`) and a deprecated
 * seventh (`warm`) that the others never had; `Toast` adds `loading` and
 * `neutral`, which no notice has. They are NOT unified here. A theme target
 * reflects the prop a consumer typed, so a recipe written against
 * `[data-tone="warm"]` has to keep working for exactly as long as the prop
 * does, and inventing one shared severity vocabulary would have made the
 * attribute a translation of the API rather than a reflection of it.
 */
export const feedbackThemeTargets = {
  alert: {
    axes: { tone: ["info", "success", "warning", "danger"] },
    /*
     * One target, four slots — `Card`'s shape, for `Card`'s reason: the title,
     * body, and action share the notice's tint and only ever move with it. The
     * copy wrapper and the dismiss cell are not slots; they are grid cells the
     * responsive column tracks own, and a brand that could pad them would be
     * editing the layout from outside the call site.
     */
    exports: [
      "Alert",
      "AlertAction",
      "AlertDescription",
      "AlertRoot",
      "AlertTitle",
    ],
    properties: notice,
    root: "the `<div>` the headless alert root renders",
    slots: {
      action: [...themeSpaceProperties],
      description: ink,
      media: glyph,
      title: ink,
    },
  },
  banner: {
    axes: { tone: ["info", "success", "warning", "danger"] },
    exports: [
      "Banner",
      "BannerAction",
      "BannerDescription",
      "BannerRoot",
      "BannerTitle",
    ],
    properties: notice,
    root: "the `<section>` the banner surface renders",
    slots: {
      action: [...themeSpaceProperties],
      description: ink,
      media: glyph,
      title: ink,
    },
  },
  callout: {
    axes: {
      /* `warm` is the retained migration alias for `warning`; both are here
       * because both are still spellable at a call site. */
      tone: ["accent", "info", "warning", "warm", "success", "danger"],
    },
    exports: [
      "Callout",
      "CalloutAction",
      "CalloutDescription",
      "CalloutRoot",
      "CalloutTitle",
    ],
    properties: notice,
    root: "the `<div>` the callout renders in the reading column",
    slots: {
      action: [...themeSpaceProperties],
      description: ink,
      media: glyph,
      title: ink,
    },
  },
  "empty-state": {
    /*
     * `variant`, not `tone`. The container treatment is the only axis the root
     * paints by: `tone` selects the medallion's tint, which `IconTile` owns and
     * paints, so reflecting it here would advertise a rule that lands on a
     * surface with no tone in it.
     */
    axes: { variant: ["card", "plain"] },
    exports: [
      "EmptyState",
      "EmptyStateContent",
      "EmptyStateDescription",
      "EmptyStateHeader",
      "EmptyStateMedia",
      "EmptyStateRoot",
      "EmptyStateTitle",
    ],
    properties: notice,
    root: "the `<section>` the empty-state surface renders",
    slots: {
      content: [...themeSpaceProperties],
      description: ink,
      header: [...themeSpaceProperties],
      /*
       * The medallion is a round `xl` `IconTile`, so unlike the notices' bare
       * tone glyph it paints a fill and a corner of its own.
       */
      media: ["backgroundColor", "borderRadius", "color", "opacity"],
      title: ink,
    },
  },
  loader: {
    /*
     * `tone` only. The cadence is already in the DOM as
     * `data-ads-loader-variant`, which `styles.css` selects on to drive the
     * animation; a `data-variant` beside it would be a second channel for one
     * fact, and the mark's geometry is not themeable anyway.
     */
    axes: { tone: ["accent", "inherit", "neutral"] },
    exports: ["Loader"],
    /*
     * `color` is the whole of it: every mark in twenty-one variants is drawn in
     * `currentColor`, so one declaration on the root repaints all of them.
     */
    properties: ["color", "columnGap", "lineHeight", "opacity"],
    root: "the `<span>` `Loader` wraps the mark and its status label in",
    slots: { label: ink },
  },
  skeleton: {
    axes: {
      variant: ["text", "block", "avatar", "chip", "control", "row"],
    },
    /*
     * The three shape-matched placeholders compose `Skeleton`, so their
     * rendered blocks carry this class too. Their own wrappers do not: the tree
     * and the text stack paint nothing at all, and the page header's trailing
     * hairline is a divider that follows the border token rather than the
     * placeholder's paint.
     */
    exports: [
      "PageHeaderSkeleton",
      "Skeleton",
      "TextBlockSkeleton",
      "TreeSkeleton",
    ],
    /*
     * `color` is not decoration here — the shimmer is a `currentColor`
     * pseudo-element, so the ink is what a brand recolours the sweep with.
     */
    properties: [
      "backgroundColor",
      "backgroundImage",
      "borderRadius",
      "color",
      "opacity",
    ],
    root: "the `<div>` a placeholder renders, or one `<span>` per line in the multi-line text stack",
  },
  toast: {
    axes: {
      tone: [
        "danger",
        "info",
        "loading",
        "neutral",
        "success",
        "warning",
      ],
    },
    /*
     * `ToastHost` renders the stack; `Toast` is the demo that mounts a host and
     * pushes into it. Neither owns a card of its own — the card is the Base UI
     * root this class lands on. The viewport is not a target: it is fixed
     * placement and nothing else, and placement is not themeable.
     */
    exports: ["Toast", "ToastHost"],
    properties: surface,
    root: "the Base UI toast root element — the card itself",
    slots: {
      /*
       * The dismiss control, a slot rather than the `button` target for the
       * same reason `dialog-popup`'s is: it is a `surfaceChrome.quietIconButton`
       * square, not a `Button`, so a brand's `.ads-button` rule has never
       * reached it.
       */
      close: [...surface, ...themeFocusProperties],
      /* The card's internal air lives on the content column, not on the root. */
      content: [...themeSpaceProperties],
      description: ink,
      icon: glyph,
      title: ink,
    },
  },
} as const satisfies ThemeTargetRegistry;
