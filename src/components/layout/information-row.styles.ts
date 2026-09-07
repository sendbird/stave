import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The Information panel's list row.
 *
 * Every section in this panel lists the same shape of thing — a linked pull
 * request, a saved plan, a remembered decision — and each one had grown its own
 * container. The pull-request row was a borderless hover row; the plan row was
 * a tinted card with a hairline and always-visible action buttons; the memory
 * row was a bordered card with a button bar inside it. Three treatments in one
 * scrolling column, so the panel read as three panels stacked.
 *
 * This is that row, once. A row is **not a card**: no fill and no perimeter at
 * rest, because the panel's section headers already say where one list ends and
 * the next begins, and N bordered cards inside an already-bordered panel is the
 * concentric-box problem `agentSurface` was written to stop. What the row has
 * instead is padding, a hover wash, a leading mark, and a trailing action
 * cluster that stays out of the way until the pointer arrives.
 *
 * `--info-row-action-opacity` is the contract between the row and its trail:
 * the row owns the variable, the trail reads it, so hovering anywhere on the
 * row reveals its actions and no child needs its own hover rule. Keyboard users
 * are not served by hover, so the trail also forces itself visible on
 * `:focus-within`.
 */
export const informationRow = stylex.create({
  /** The list. Negative inline margin lets the hover wash bleed to the panel's
   *  gutter while the text still lines up with the section title above it. */
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    marginInline: -8,
  },
  root: {
    "--info-row-action-opacity": { default: "0", ":hover": "1" },
    alignItems: "flex-start",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusControl,
    display: "flex",
    gap: 10,
    paddingBlock: 10,
    paddingInline: 6,
  },
  /** Keyboard focus inside the row is the non-pointer equivalent of hover. */
  rootFocusWithin: {
    "--info-row-action-opacity": { default: "0", ":focus-within": "1" },
  },
  /** The object glyph. `marginBlockStart` optically centres it on the first
   *  line of the title rather than on the title block. */
  mark: {
    blockSize: vars.controlIconSizeMd,
    flexShrink: 0,
    inlineSize: vars.controlIconSizeMd,
    marginBlockStart: 2,
  },
  body: { flex: 1, minWidth: 0 },
  titleLine: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space8,
  },
  /** The row's own name, and its link. Accent + underline on hover is the only
   *  affordance it needs; the row wash already says the row is live. */
  title: {
    color: { default: vars.colorText, ":hover": vars.colorAccent },
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightNormal,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "start",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** A title that is prose rather than a name — a remembered sentence — wraps
   *  to two lines instead of ellipsizing at the first one. */
  titleWrap: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    whiteSpace: "normal",
  },
  /** Metadata under the title: counts, paths, branches, kinds. */
  meta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBlockStart: vars.space4,
  },
  metaText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /* A branch, a path, a ref. It truncates rather than wrapping: breaking
     `fix/ads-regressions → main` across two lines splits one identifier into
     two half-words, which is harder to read than an ellipsis. */
  metaMono: {
    color: vars.colorTextSubtle,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaNumeric: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars.lineHeightTight,
  },
  trail: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space2,
    opacity: "var(--info-row-action-opacity)",
    paddingBlockStart: 2,
    transitionDuration: {
      default: vars.motionDurationFast,
      "@media (prefers-reduced-motion: reduce)": vars.motionDurationMicro,
    },
    transitionProperty: "opacity",
  },
});
