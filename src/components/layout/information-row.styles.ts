import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
 * are not served by hover, so `:focus-within` is the other arm of the SAME
 * declaration. Splitting hover and focus-within across two StyleX objects
 * lets the later class replace the custom-property value, so hover never
 * reaches the trail and the buttons only appear after a click focuses them.
 */
export const informationRow = stylex.create({
  /** The list. Negative inline margin lets the hover wash bleed to the panel's
   *  gutter while the text still lines up with the section title above it. */
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    marginInline: -8,
  },
  root: {
    "--info-row-action-opacity": {
      default: "0",
      ":focus-within": "1",
      ":hover": "1",
    },
    alignItems: "flex-start",
    backgroundColor: {
      default: "transparent",
      ":focus-within": vars["--aui-color-overlay-hover"],
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: 10,
    paddingBlock: 10,
    paddingInline: 6,
  },
  /** The object glyph. `marginBlockStart` optically centres it on the first
   *  line of the title rather than on the title block. */
  mark: {
    blockSize: vars["--aui-control-icon-size-md"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-md"],
    marginBlockStart: 2,
  },
  body: { flex: 1, minWidth: 0 },
  titleLine: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  /** The row's own name, and its link. Accent + underline on hover is the only
   *  affordance it needs; the row wash already says the row is live. */
  title: {
    color: { default: vars["--aui-color-text"], ":hover": vars["--aui-color-accent"] },
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
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
    marginBlockStart: vars["--aui-space-4"],
  },
  metaText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /* A branch, a path, a ref. It truncates rather than wrapping: breaking
     `fix/aui-regressions → main` across two lines splits one identifier into
     two half-words, which is harder to read than an ellipsis. */
  metaMono: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaNumeric: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars["--aui-line-height-tight"],
  },
  trail: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
    opacity: "var(--info-row-action-opacity)",
    paddingBlockStart: 2,
    transitionDuration: {
      default: vars["--aui-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": vars["--aui-motion-duration-micro"],
    },
    transitionProperty: "opacity",
  },
});
