import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

// Enter/exit for the whole shelf: a short fade paired with a 8px vertical
// slide, so the shelf grows in and collapses away instead of popping.
const enter = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const exit = stylex.keyframes({
  from: { opacity: 1, transform: "translateY(0)" },
  to: { opacity: 0, transform: "translateY(8px)" },
});

// A row appears once when its activity lands; it does not replay on updates.
const rowIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const SHELF_MOTION_DURATION = "200ms";

export const turnActivityStyles = stylex.create({
  panelIdle: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    height: "100%",
    justifyContent: "center",
    paddingInline: vars["--aui-space-24"],
    textAlign: "center",
  },
  // Floating shell inner pointer target.
  floatInner: {
    pointerEvents: "auto",
    width: "min(26rem, 80vw)",
  },

  // ── Outer stack, per variant ────────────────────────────────────────
  stackDocked: {
    position: "relative",
    zIndex: 0,
  },
  // Standalone docked pulls the composer up over its extra bottom padding.
  stackDockedStandalone: {
    marginBottom: "-0.75rem",
    marginInline: vars["--aui-space-12"],
    position: "relative",
    zIndex: 0,
  },
  stackFloating: {
    position: "relative",
  },
  // The list inside the composer shelf: the shelf is already on screen, so
  // the list only fades in. No transform, so nothing slides under the line.
  stackInlineEnter: {
    animationName: {
      default: rowIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: vars["--aui-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  stackPanel: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  stackEnter: {
    animationName: {
      default: enter,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  stackLeaving: {
    animationName: {
      default: exit,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationFillMode: "forwards",
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    pointerEvents: "none",
  },

  // ── Surface section ─────────────────────────────────────────────────
  surface: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
    transitionDuration: {
      default: "200ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "box-shadow, border-color",
    transitionTimingFunction: "ease-out",
  },
  // A floating or panelled surface is a card in its own right; the docked one
  // takes its surface from the global `.turn-activity-surface` class.
  surfaceCard: {
    backgroundColor: vars["--aui-color-surface"],
  },
  surfaceDocked: {
    borderStartStartRadius: vars["--aui-radius-frame"],
    borderStartEndRadius: vars["--aui-radius-frame"],
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
    paddingBottom: "0.75rem",
  },
  surfaceFloating: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    paddingBottom: vars["--aui-space-8"],
  },
  surfacePanel: {
    flex: 1,
    paddingBottom: vars["--aui-space-8"],
  },

  // ── Header row ──────────────────────────────────────────────────────
  header: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.625rem",
    minHeight: "2.75rem",
    paddingInline: vars["--aui-space-12"],
  },
  headerInset: {
    paddingBlock: vars["--aui-space-12"],
  },
  headerStandard: {
    paddingBlock: vars["--aui-space-8"],
  },
  headerExpanded: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 10%, transparent)`,
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
  },
  headerGrab: {
    cursor: "grab",
    touchAction: "none",
    userSelect: "none",
  },
  loaderSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  loaderInk: {
    color: vars["--aui-color-text"],
  },
  // The ended-turn glyph, sized to sit in the same 24px slot the `sm` loader
  // ran in, so the header does not shift when the turn comes to rest.
  restMark: {
    height: 18,
    width: 18,
  },
  restMarkSuccess: {
    color: vars["--aui-color-success"],
  },
  restMarkDanger: {
    color: vars["--aui-color-danger"],
  },
  restMarkMuted: {
    color: vars["--aui-color-text-muted"],
  },
  // Visually hidden but present for AT — used where the element's tag matters
  // (the `<h2>` heading) so the AUI VisuallyHidden span cannot substitute.
  srOnly: {
    blockSize: 1,
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  replayBadge: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-full"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.025em",
    paddingBlock: "0.125rem",
    paddingInline: vars["--aui-space-8"],
    textTransform: "uppercase",
  },
  headline: {
    flex: 1,
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    fontSize: vars["--aui-font-size-body"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headlineTitle: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  headlineDetail: {
    color: vars["--aui-color-text-muted"],
  },
  progress: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  overflowCount: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    fontVariantNumeric: "tabular-nums",
  },
  overflowFailed: {
    color: vars["--aui-color-danger"],
  },
  overflowWaiting: {
    color: vars["--aui-color-warning"],
  },
  overflowDefault: {
    color: vars["--aui-color-text-muted"],
  },
  elapsed: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },

  chevron: {
    height: 14,
    width: 14,
  },

  // ── List ────────────────────────────────────────────────────────────
  list: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 10%, transparent)`,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  listDocked: {
    maxHeight: "min(12rem, 28vh)",
  },
  // Under the shelf's run line, divided from it by a hairline. Taller than the
  // old shelf list: it is opened on purpose and closes with the same toggle.
  listInline: {
    backgroundColor: "transparent",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    maxHeight: "min(16rem, 34vh)",
  },
  listEmpty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  // ── Floating card grip ──────────────────────────────────────────────
  floatingGrip: {
    alignItems: "center",
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    minHeight: "2rem",
    paddingInlineEnd: vars["--aui-space-4"],
    paddingInlineStart: vars["--aui-space-12"],
  },
  floatingGripIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  floatingGripTitle: {
    color: vars["--aui-color-text-muted"],
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    minWidth: 0,
  },
  floatingGripClose: {
    color: vars["--aui-color-text-muted"],
  },
  listFloating: {
    maxHeight: "min(24rem, 55vh)",
  },
  listPanel: {
    flex: 1,
  },
  listInner: {
    paddingBlock: 6,
    paddingInline: 6,
  },
  // Outcome tiles leave the scrolling list in the panel so they sit on the
  // rail floor while the activity rows use the leftover height.
  summaryPinned: {
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    flexShrink: 0,
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 6,
    maxHeight: "40%",
    overflowY: "auto",
  },
  childBlock: {
    paddingInline: 6,
    paddingTop: vars["--aui-space-8"],
  },
  childBlockPadded: {
    paddingBottom: vars["--aui-space-4"],
    paddingInline: 6,
    paddingTop: vars["--aui-space-8"],
  },
  // The backlink leads the list, so it takes the row inset without the gap a
  // block spends separating itself from the rows above.
  childBlockLead: {
    paddingBottom: vars["--aui-space-4"],
    paddingInline: 6,
  },
  // The agent tree sits inside the Agents block, under its rows.
  childBlockNested: {
    paddingTop: vars["--aui-space-4"],
  },

  // ── Row ─────────────────────────────────────────────────────────────
  rowStatusSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    fontSize: vars["--aui-font-size-body"],
  },
  rowTitleLineDone: {
    color: vars["--aui-color-text-muted"],
  },
  rowTitle: {
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Panel rows can spend height on the path or command. Docked stays one line.
  rowTitleLineExpanded: {
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  rowTitleExpanded: {
    display: "-webkit-box",
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "normal",
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    paddingInline: vars["--aui-space-4"],
  },
  rowDetailLine: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    gap: 6,
    lineHeight: "1rem",
    margin: 0,
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
  },
  rowDetail: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDetailLineExpanded: {
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  rowDetailExpanded: {
    display: "-webkit-box",
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    whiteSpace: "normal",
  },
  rowDetailRule: {
    backgroundColor: vars["--aui-color-border"],
    flexShrink: 0,
    height: "0.625rem",
    width: 1,
  },
  rowProviderDetail: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowProviderDetailExpanded: {
    display: "-webkit-box",
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "normal",
  },
  rowStartOffset: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    paddingTop: "0.125rem",
  },
  rowElapsed: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    paddingTop: "0.125rem",
  },
  // Row shell — plain or interactive; the interactive one composes the AUI
  // quiet-button chrome / focus ring at the call site.
  row: {
    alignItems: "flex-start",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: "0.625rem",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--aui-space-8"],
    textAlign: "left",
    width: "100%",
  },
  rowMotion: {
    animationName: {
      default: rowIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
