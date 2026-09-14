import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const enterKeyframes = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translateY(0.5rem)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

export const todoFloaterStyles = stylex.create({
  wrapperLingering: {
    opacity: 0.5,
  },
  wrapperVisible: {
    animationName: {
      default: enterKeyframes,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: vars["--ads-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    opacity: 1,
  },
  card: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
  },
  headerIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
  },
  headerTitle: {
    flexGrow: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
  },
  progressTrack: {
    backgroundColor: vars["--ads-color-border"],
    height: 2,
    width: "100%",
  },
  progressBar: {
    // `transition.bar` + `motionDurationEmphasis` at the call site. The fill
    // also swaps `background-color` between the active and complete variants
    // below, which the old `width`-only list never eased; `motionEaseStandard`
    // replaces the hand-written `ease-out`.
    height: "100%",
  },
  progressBarActive: {
    backgroundColor: vars["--ads-color-accent"],
  },
  progressBarComplete: {
    backgroundColor: vars["--ads-color-success"],
  },
  items: {
    maxHeight: "15rem",
    overflowY: "auto",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: "0.875rem",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  item: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.625rem",
  },
  itemLabel: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: 1.55,
  },
  itemLabelCompleted: {
    color: vars["--ads-color-text-muted"],
    textDecorationLine: "line-through",
  },
  itemLabelInProgress: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  itemLabelPending: {
    color: vars["--ads-color-text-muted"],
  },
  statusIcon: {
    flexShrink: 0,
    marginTop: "0.1875rem",
  },
  statusIconCompleted: {
    color: vars["--ads-color-success"],
  },
  statusIconPending: {
    color: vars["--ads-color-text-subtle"],
  },
  statusLoader: {
    color: vars["--ads-color-accent"],
    marginTop: "0.1875rem",
  },
});
