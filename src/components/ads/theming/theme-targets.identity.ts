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

/** A surface that also owns its own internal air. */
const region = [...surface, ...themeSpaceProperties] as const;

/** A control: a region that also takes the keyboard focus ring. */
const control = [...region, ...themeFocusProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A signal object's allowance: type, internal air, and the corner/edge
 * GEOMETRY — but no `color`, `backgroundColor`, `borderColor`, `boxShadow` or
 * `opacity`. Every target that takes this alias exists to encode a state in
 * colour (presence, an SLA breach, a moderation verdict, a review outcome),
 * and its colour is *derived by the component from that state*, not chosen by
 * the caller. A brand that could repaint it could make breach and OK the same
 * red, so severity is kept off the allowance and moves with the
 * danger/warning/success tokens a brand already owns — the same call
 * `breadcrumb-trail` makes in the tabs family. What a brand CAN still tune is
 * the chip's rhythm: its type, its padding, and its corner.
 */
const signal = [
  ...themeTypographyProperties,
  ...themeSpaceProperties,
  "borderRadius",
  "borderStyle",
  "borderWidth",
] as const;

/**
 * The identity family: the marks that say *who* and *what state*.
 *
 * Two rules decide every call in it. The first is the ordinary one — only a
 * TARGET carries states, so a pressable part with its own hover/press paint is
 * its own target even inside another's box (`badge-remove`, `link-chip`). The
 * second is the SIGNAL rule, and it is the one this family is built around.
 * Most of these components exist to encode a state in colour, and the colour is
 * the distinction: recolour a presence dot and you have erased the difference
 * between online and offline. So a signal object gets the `signal` allowance —
 * type, air and corner, no paint — and a brand recolours those states through
 * the danger/warning/success tokens it owns, never through the target class.
 *
 * The line this family draws, and the reason it is not uniform: an object whose
 * tone the CALLER chooses (`Badge tone="accent"`, an `Indicator` attention dot)
 * is themeable in colour, because there the tone is emphasis a brand may
 * rebrand and the reader has another channel — the chip's own text, the mark's
 * own count. An object whose tone the COMPONENT derives from a state
 * (`SlaChip`'s breach, `ModerationStatus`'s verdict, `ReviewStatus`'s outcome,
 * `PresenceBadge`'s presence) is not, because there the colour IS the verdict.
 */
export const identityThemeTargets = {
  avatar: {
    /*
     * `size` only. `shape` is a corner (`circle`/`square`) the vocabulary has
     * no axis for and would express as geometry a brand cannot switch on
     * anyway; `status` is a presence dot painted by an internal sibling, which
     * is signal and not this disc's paint. The disc's own fill is the
     * `colorAccentSoft` identity plate and its initials the accent ink — brand
     * surface, not a state, so it takes the full surface allowance.
     */
    axes: { size: ["xs", "sm", "md", "lg", "xl"] },
    exports: ["Avatar"],
    properties: surface,
    root: "the `<span>` `AvatarRoot` renders as the identity disc",
  },
  "avatar-group": {
    /*
     * The stacked row. Its own paint is the overlap ring the `item` slot draws
     * — a `colorSurfaceRaised` border that separates one disc from the one it
     * overlaps — so the ring is the one thing a brand reaches for and it lives
     * on the slot, not the root. No `size` axis: the row does not paint by
     * size, the discs inside it do, and each of those is a `.ads-avatar`.
     */
    exports: ["AvatarGroup"],
    properties: themeSpaceProperties,
    root: "the `<div role=\"group\">` `AvatarGroup` renders",
    slots: {
      /* The overlap separator ring — geometry and its own edge colour. */
      item: ["borderColor", "borderRadius", "borderStyle", "borderWidth"],
    },
  },
  badge: {
    /*
     * A general label / token chip, so its colour IS themeable per tone: a
     * brand that restyles `.ads-badge[data-tone="accent"]` is choosing its own
     * category-tag paint, the same deliberate choice the pilot lets it make on
     * `Button`. This is the caller-chosen side of the family's line — the chip
     * always carries text, so colour is never its only channel, and `tone` here
     * is a prop the caller sets, not a verdict the component derives.
     * `warm` is the deprecated alias of `warning`; it is a real prop value, so
     * it is reflected verbatim.
     */
    axes: {
      size: ["sm", "md"],
      tone: [
        "neutral",
        "accent",
        "info",
        "warning",
        "warm",
        "success",
        "danger",
      ],
      variant: ["soft", "outline", "solid"],
    },
    exports: ["Badge"],
    properties: region,
    root: "the `<span>` `Badge` renders",
    slots: {
      /* The tone dot rides `currentColor`; a brand reaches its ink here. */
      dot: ["color", "opacity"],
      /* The truncating label box — a real block child, type only. */
      label: ink,
    },
  },
  "badge-remove": {
    /*
     * The removable chip's `×` button. No public export of its own — it is
     * internal to `Badge` — but it has its own hover/press wash and takes the
     * focus ring, and only a target carries states, so it cannot be a slot.
     */
    exports: [],
    properties: control,
    root: "the `<button>` `Badge` renders when `onRemove` is set",
    states: ["hover", "active", "focus-visible"],
  },
  "connection-quality": {
    /*
     * A call-quality glyph: three bars filled by grade, the fill colour being
     * the whole signal (success / warning / empty + danger ×). `signal`, so a
     * brand tunes the label's type and the row's air without repainting the
     * grade. `showLabel` is a boolean, not an axis value.
     */
    exports: ["ConnectionQuality"],
    properties: signal,
    root: "the `<span role=\"img\">` `ConnectionQuality` renders",
    slots: { label: ink },
  },
  "icon-tile": {
    /*
     * The counterpoint to the signal chips: `IconTile` is a *decorative*
     * tinted container for a glyph, and its own docstring says so. Its tone is
     * a caller-chosen category colour with no state semantics, so it takes the
     * full surface allowance and reflects `tone`. `shape` is a corner the
     * vocabulary has no axis for.
     */
    axes: {
      size: ["xs", "sm", "md", "lg", "xl"],
      tone: ["neutral", "accent", "info", "warning", "success", "danger"],
    },
    exports: ["IconTile"],
    properties: surface,
    root: "the `<span>` `IconTile` renders",
  },
  indicator: {
    /*
     * The corner attention mark — an unread count or an attention dot. Colour
     * is themeable for the same reason as `Badge`: the count is the signal and
     * the tone is emphasis a brand may rebrand, and the caller chooses the tone
     * (default `danger` is a convention, not a derived verdict). The class
     * lands on the painted mark, which is the one element shared by both the
     * wrapper form and the bare-mark form; the anchor/slot wrappers around it
     * only position and paint nothing.
     */
    axes: {
      size: ["sm", "md"],
      tone: ["neutral", "accent", "info", "warning", "success", "danger"],
    },
    exports: ["Indicator"],
    properties: region,
    root: "the `<span>` `Indicator` renders as the mark, anchored or bare",
  },
  "link-chip": {
    /*
     * An interactive chip-framed `<a>` with its own hover/press wash and focus
     * ring — a control, and not a signal object: its resting fill is the
     * neutral `colorSurfaceRaised` chip, not a state. Full control allowance,
     * `size` on the shared control scale.
     */
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["LinkChip"],
    properties: control,
    root: "the `<a>` `LinkChip` renders",
    slots: {
      /* The leading glyph box — muted ink of its own. */
      icon: ["color", "opacity"],
      label: ink,
    },
  },
  "moderation-status": {
    /*
     * A moderation verdict chip: visible / flagged / hidden / deleted /
     * escalated, each a derived tone. `signal` — the verdict's colour is the
     * verdict. `tone` is reflected because it is a real override prop and lets
     * a brand's rule reach a specific state's type without repainting it.
     */
    axes: {
      size: ["sm", "md"],
      tone: ["neutral", "accent", "info", "warning", "success", "danger"],
    },
    exports: ["ModerationStatus"],
    properties: signal,
    root: "the `<span>` `ModerationStatus` renders",
    slots: { label: ink },
  },
  "presence-badge": {
    /*
     * Chat presence: online / away / busy / offline, the dot's colour being
     * the entire signal. `signal`, so the label's type and the row's air move
     * but the presence colours do not. The dot is not a slot — a paintable dot
     * slot would be exactly the repaint the signal rule forbids.
     */
    axes: { size: ["sm", "md"] },
    exports: ["PresenceBadge"],
    properties: signal,
    root: "the `<span role=\"status\">` `PresenceBadge` renders",
    slots: { label: ink },
  },
  "review-status": {
    /*
     * A review-workflow pill: draft / in-review / changes-requested /
     * approved / rejected, tone derived from the state. `signal`. `state` is a
     * real prop but is not one of the four axes and is already reflected as
     * `data-state`; `variant` (soft/outline) and `size` are the axes.
     */
    axes: {
      size: ["sm", "md"],
      variant: ["soft", "outline"],
    },
    exports: ["ReviewStatus"],
    properties: signal,
    root: "the `<span>` `ReviewStatus` renders",
  },
  "approval-bar": {
    /*
     * The review decision bar is NOT a signal object: it is a neutral
     * `colorSurfaceRaised` container that HOLDS a `ReviewStatus` pill and the
     * approve/reject buttons. So it takes the full region allowance — a brand
     * restyles the bar's own surface freely, while the verdict inside it stays
     * the pill's `.ads-review-status`. The buttons are `.ads-button`.
     */
    exports: ["ApprovalBar"],
    properties: region,
    root: "the `<div>` `ApprovalBar` renders",
    slots: {
      /* The progress-summary text — quiet ink beside the pill. */
      summary: ink,
    },
  },
  "sla-chip": {
    /*
     * The SLA countdown: ok / warning / breach, derived from remaining time.
     * `signal` — breach is danger and must stay danger. `size` is the only
     * axis; the state has no prop spelling to reflect.
     */
    axes: { size: ["sm", "md"] },
    exports: ["SlaChip"],
    properties: signal,
    root: "the `<span role=\"timer\">` `SlaChip` renders",
    slots: {
      /* The tabular countdown readout — type only. */
      readout: ink,
    },
  },
  "status-dot": {
    /*
     * The lifecycle dot: queued / running / ready / error / canceled, or a
     * bare semantic `tone`. Either way the dot's colour is the signal, so
     * `signal`. `variant` (solid/ring) is a real shape prop and reflected;
     * `status`/`tone` are the signal and are not.
     */
    axes: {
      size: ["sm", "md", "lg"],
      variant: ["solid", "ring"],
    },
    exports: ["StatusDot"],
    properties: signal,
    root: "the `<span>` `StatusDot` renders",
    slots: { label: ink },
  },
} as const satisfies ThemeTargetRegistry;
