import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/*
 * One surface over the prompt input, rows divided by hairlines.
 *
 * The tuck (`0.75rem` hidden behind the raised card) is the frame's measured
 * overlap, kept literal like the frame's own. A row is 2rem — the shelf's one
 * height step — and starts its text in the same column on every row: 12px
 * inset, a 20px mark, an 8px gap.
 *
 * Width is read with container queries on each row, not the viewport: the
 * sidebar and the panels squeeze the composer long before the window shrinks.
 * The composer measure is the row plus the 0.75rem inset on each side, so the
 * 560px measure step is a 536px row.
 */
const TUCK = "0.75rem";
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
    borderStartStartRadius: vars["--ads-radius-frame"],
    borderStartEndRadius: vars["--ads-radius-frame"],
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
    paddingTop: vars["--ads-space-2"],
    paddingBottom: TUCK,
  },
  /** The classic composer: the shelf takes the frame's inset and tuck itself. */
  standalone: {
    marginInline: vars["--ads-space-12"],
    marginBottom: `calc(-1 * ${TUCK})`,
  },
  enter: {
    animationName: { default: enter, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--ads-motion-duration-normal"],
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
  leaving: {
    animationName: { default: exit, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--ads-motion-duration-normal"],
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    animationFillMode: "forwards",
    pointerEvents: "none",
  },
  /** A row joining a shelf that is already up fades in; it does not slide. */
  rowEnter: {
    animationName: { default: fadeIn, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--ads-motion-duration-normal"],
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
  rowLeaving: {
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: vars["--ads-motion-duration-normal"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    pointerEvents: "none",
  },
  /** Every row after the first is divided from the one above by a hairline. */
  row: {
    containerType: "inline-size",
    minWidth: 0,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": 0,
    },
  },

  // ── A line ──────────────────────────────────────────────────────────
  line: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    minHeight: ROW,
    paddingInlineStart: vars["--ads-space-12"],
    paddingInlineEnd: vars["--ads-space-4"],
  },
  mark: {
    display: "flex",
    flex: "0 0 auto",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
  },
  markIcon: { width: 14, height: 14 },
  text: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
    color: vars["--ads-color-text-muted"],
  },
  label: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  labelWaiting: { color: vars["--ads-color-warning-text"] },
  labelDanger: { color: vars["--ads-color-danger-text"] },
  labelAccent: { color: vars["--ads-color-accent"] },
  strong: { color: vars["--ads-color-text"] },
  /** Says at a narrow width what the progress segment says when there is room. */
  narrowOnly: { display: { default: "none", [NARROW]: "inline" } },
  wideOnly: { display: { default: "inline-flex", [NARROW]: "none" } },
  progress: {
    display: { default: "inline-flex", [NARROW]: "none" },
    flex: "0 0 auto",
    alignItems: "center",
    gap: 6,
  },
  /** The dithered stage track, compact: one line high and capped so the text keeps its room. */
  track: {
    display: { default: "block", [NARROW]: "none" },
    flex: "0 1 11rem",
    minWidth: "6rem",
  },
  segments: { display: "inline-flex", alignItems: "center", gap: 2 },
  segment: {
    width: 6,
    height: 4,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-border-strong"],
  },
  segmentDone: { backgroundColor: vars["--ads-color-accent"] },
  segmentActive: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 45%, transparent)`,
  },
  count: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  /** A fixed slot at the end, so a ticking clock never shifts the buttons. */
  meta: {
    flex: "0 0 auto",
    minWidth: "4ch",
    textAlign: "end",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  actions: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: vars["--ads-space-2"],
  },
  quiet: { color: vars["--ads-color-text-muted"] },
  pressed: { color: vars["--ads-color-text"] },
  /** The front item's action keeps its glyph and drops its word when narrow. */
  actionWord: { display: { default: "inline", [NARROW]: "none" } },

  // ── Queue list ──────────────────────────────────────────────────────
  queueIcon: { width: 14, height: 14, color: vars["--ads-color-text-muted"] },
  caution: { color: vars["--ads-color-warning-text"] },
  queueList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    // Four rows show; a longer queue scrolls inside the shelf.
    maxHeight: `calc(4 * ${ROW} + ${vars["--ads-space-8"]})`,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--ads-space-2"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
    animationName: { default: fadeIn, [REDUCED_MOTION]: "none" },
    animationDuration: vars["--ads-motion-duration-normal"],
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
  item: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    minHeight: ROW,
    paddingInlineStart: vars["--ads-space-12"],
    paddingInlineEnd: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    transitionProperty: "background-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
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
  itemEditing: { alignItems: "stretch", paddingBlock: vars["--ads-space-4"] },
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
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    opacity: `calc(1 - var(${HOVER_ACTIONS}))`,
    transitionProperty: "opacity",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  itemGrip: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars["--ads-color-text-muted"],
    cursor: "grab",
    opacity: `var(${HOVER_ACTIONS})`,
    transitionProperty: "opacity",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  itemGripIcon: { width: 14, height: 14 },
  itemBody: { flex: "1 1 auto", minWidth: 0 },
  itemText: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
    color: vars["--ads-color-text"],
  },
  itemCaution: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--ads-color-warning-text"],
  },
  itemMeta: {
    flex: "0 0 auto",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  itemActions: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: vars["--ads-space-2"],
    overflow: "hidden",
    maxWidth: `calc(var(${HOVER_ACTIONS}) * 9rem)`,
    opacity: `var(${HOVER_ACTIONS})`,
    transitionProperty: "opacity",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: "ease",
  },
  itemAccent: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-accent"] },
  },
  itemDanger: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-danger"] },
  },
  editArea: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  editTextarea: {
    minHeight: 64,
    resize: "vertical",
    fontSize: vars["--ads-font-size-body"],
  },
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--ads-space-4"],
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
