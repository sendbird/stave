import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/*
 * One surface over the prompt input, rows divided by hairlines.
 *
 * The tuck (`0.75rem` hidden behind the raised card) is the frame's measured
 * overlap, kept literal like the frame's own. Above it the shelf keeps 4px
 * clear of the card's 3px focus ring, so the last row is never drawn under
 * it: one bar band is 2px + 2rem rows + 4px, the same 38px every composer bar
 * shows (`composer-frame.styles.ts`). A row is 2rem — the shelf's one height
 * step — and starts its text in the same column on every row: 12px inset, a
 * 20px mark, an 8px gap.
 *
 * Width is read with container queries on each row, not the viewport: the
 * sidebar and the panels squeeze the composer long before the window shrinks.
 * The composer measure is the row plus the 0.75rem inset on each side, so the
 * 560px measure step is a 536px row.
 */
const TUCK = "0.75rem";
/** The card's 3px focus ring plus 1px of air. */
const RING_CLEARANCE = "4px";
const ROW = "2rem";
const NARROW = "@container (max-width: 535px)";
const HOVER_ACTIONS = "--composer-shelf-item-hover";

const enter = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});
const exit = stylex.keyframes({
  from: { opacity: 1, transform: "translateY(0)" },
  to: { opacity: 0, transform: "translateY(8px)" },
});
const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

export const shelfStyles = stylex.create({
  surface: {
    position: "relative",
    zIndex: 0,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderStartStartRadius: vars["--aui-radius-frame"],
    borderStartEndRadius: vars["--aui-radius-frame"],
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
    paddingTop: vars["--aui-space-2"],
    paddingBottom: `calc(${TUCK} + ${RING_CLEARANCE})`,
  },
  /** The classic composer: the shelf takes the frame's inset and tuck itself. */
  standalone: {
    marginInline: vars["--aui-space-12"],
    marginBottom: `calc(-1 * ${TUCK})`,
  },
  enter: {
    animationName: { default: enter, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--aui-motion-duration-normal"],
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  leaving: {
    animationName: { default: exit, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--aui-motion-duration-normal"],
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    animationFillMode: "forwards",
    pointerEvents: "none",
  },
  /** A row joining a shelf that is already up fades in; it does not slide. */
  rowEnter: {
    animationName: { default: fadeIn, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--aui-motion-duration-normal"],
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  rowLeaving: {
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: vars["--aui-motion-duration-normal"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
    pointerEvents: "none",
  },
  /** Every row after the first is divided from the one above by a hairline. */
  row: {
    containerType: "inline-size",
    minWidth: 0,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
  },

  // ── A line ──────────────────────────────────────────────────────────
  line: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    minHeight: ROW,
    paddingInlineStart: vars["--aui-space-12"],
    paddingInlineEnd: vars["--aui-space-4"],
  },
  mark: {
    display: "flex",
    flex: "0 0 auto",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
  },
  /**
   * The newest thought under the run line, aligned with its words (row
   * padding + the 20px mark + the gap) and held to two lines.
   */
  thought: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    fontStyle: "italic",
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    paddingBlockEnd: vars["--aui-space-4"],
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: `calc(${vars["--aui-space-12"]} + 20px + ${vars["--aui-space-8"]})`,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  /**
   * The tool call under a plan step: the thought's slot (composed after
   * `thought`, so it keeps that alignment), on one line and upright, so the
   * shelf stays two lines high.
   */
  action: {
    display: "block",
    fontStyle: "normal",
    overflowWrap: "normal",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    WebkitLineClamp: "unset",
  },
  /**
   * A wrapper inside the mark centers its glyph as a flex box. A bare span is
   * a block with a text line, so an inline-flex loader in it rides the font's
   * baseline and strut and lands off the row's center.
   */
  markSlot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  markIcon: { width: 14, height: 14 },
  text: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "1.25rem",
    color: vars["--aui-color-text-muted"],
  },
  label: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  subagents: {
    paddingInline: vars["--aui-space-12"],
    paddingBlockEnd: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
  },
  labelWaiting: { color: vars["--aui-color-warning-text"] },
  labelDanger: { color: vars["--aui-color-danger-text"] },
  labelAccent: { color: vars["--aui-color-accent"] },
  strong: { color: vars["--aui-color-text"] },
  /** Says at a narrow width what the progress segment says when there is room. */
  narrowOnly: { display: { default: "none", [NARROW]: "inline" } },
  wideOnly: { display: { default: "inline-flex", [NARROW]: "none" } },
  /** The count stays when the composer is narrow; only the segments give way. */
  progress: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: 6,
  },
  /** The stage progress bar, compact: one line high and capped so the text keeps its room. */
  track: {
    display: { default: "block", [NARROW]: "none" },
    flex: "0 1 11rem",
    minWidth: "6rem",
  },
  segments: { display: { default: "inline-flex", [NARROW]: "none" }, alignItems: "center", gap: 2 },
  segment: {
    width: 6,
    height: 4,
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-border-strong"],
  },
  segmentDone: { backgroundColor: vars["--aui-color-accent"] },
  segmentActive: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 45%, transparent)`,
  },
  count: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  /** A fixed slot at the end, so a ticking clock never shifts the buttons. */
  meta: {
    flex: "0 0 auto",
    minWidth: "4ch",
    textAlign: "end",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  metaWithIcon: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
  },
  actions: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: vars["--aui-space-2"],
  },
  quiet: { color: vars["--aui-color-text-muted"] },
  pressed: { color: vars["--aui-color-text"] },
  /** The front item's action keeps its glyph and drops its word when narrow. */
  actionWord: { display: { default: "inline", [NARROW]: "none" } },

  // ── Queue list ──────────────────────────────────────────────────────
  queueIcon: { width: 14, height: 14, color: vars["--aui-color-text-muted"] },
  caution: { color: vars["--aui-color-warning-text"] },
  queueList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    // Four rows show; a longer queue scrolls inside the shelf.
    maxHeight: `calc(4 * ${ROW} + ${vars["--aui-space-8"]})`,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--aui-space-2"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    animationName: { default: fadeIn, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--aui-motion-duration-normal"],
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  item: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    minHeight: ROW,
    paddingInlineStart: vars["--aui-space-12"],
    paddingInlineEnd: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    transitionProperty: "background-color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: "ease",
    // Actions take no width at rest and appear on hover or keyboard focus;
    // without hover (touch) they always show.
    [HOVER_ACTIONS]: {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
      "@media (hover: none)": "1",
    },
  },
  itemDragging: { opacity: 0.5 },
  itemEditing: { alignItems: "stretch", paddingBlock: vars["--aui-space-4"] },
  itemSlot: {
    position: "relative",
    display: "flex",
    flex: "0 0 auto",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
  },
  itemIndex: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    opacity: `calc(1 - var(${HOVER_ACTIONS}))`,
    transitionProperty: "opacity",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  // The grip is an AUI icon Button laid over the row number: it fills the
  // 20px slot rather than its own 28px square, and fades in with the row's
  // actions (hover or keyboard focus) while the number fades out. The
  // transition keeps the button's own hover fill and ink easing in too.
  itemGrip: {
    position: "absolute",
    inset: 0,
    blockSize: "100%",
    inlineSize: "100%",
    minBlockSize: 0,
    minInlineSize: 0,
    padding: 0,
    color: vars["--aui-color-text-muted"],
    cursor: "grab",
    opacity: `var(${HOVER_ACTIONS})`,
    transitionProperty: "opacity, background-color, color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  itemGripIcon: { width: 14, height: 14 },
  itemBody: { flex: "1 1 auto", minWidth: 0 },
  itemText: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "1.25rem",
    color: vars["--aui-color-text"],
  },
  itemDelivery: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--aui-color-text-muted"],
  },
  itemCaution: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--aui-color-warning-text"],
  },
  itemMeta: {
    flex: "0 0 auto",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    whiteSpace: "nowrap",
  },
  itemActions: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: vars["--aui-space-2"],
    overflow: "hidden",
    maxWidth: `calc(var(${HOVER_ACTIONS}) * 9rem)`,
    opacity: `var(${HOVER_ACTIONS})`,
    transitionProperty: "opacity",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  itemAccent: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-accent"],
    },
  },
  itemDanger: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-danger"],
    },
  },
  editArea: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  editTextarea: {
    minHeight: 64,
    resize: "vertical",
    fontSize: vars["--aui-font-size-body"],
  },
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--aui-space-4"],
  },
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
