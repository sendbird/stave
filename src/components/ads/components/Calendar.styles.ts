import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-flat"],
    color: vars["--ads-color-text"],
    display: "grid",
    gap: vars["--ads-space-12"],
    inlineSize: "min(320px, 100%)",
    minInlineSize: 0,
  },
  rootDual: {
    inlineSize: "min(656px, 100%)",
  },
  regular: {
    padding: vars["--ads-space-16"],
  },
  compact: {
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
  },
  header: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  nav: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  navButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--ads-icon-button-size"],
    justifyContent: "center",
    minBlockSize: vars["--ads-icon-button-size"],
    padding: 0,
    ":disabled": {
      color: vars["--ads-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--ads-opacity-disabled"],
    },
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    textAlign: "center",
  },
  rangeMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  panels: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 680px)": "minmax(0, 1fr)",
    },
    minInlineSize: 0,
  },
  panel: {
    display: "grid",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  panelTitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gap: vars["--ads-space-4"],
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    minInlineSize: 0,
  },
  weekday: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-4"],
    textAlign: "center",
  },
  day: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    cursor: "pointer",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-tight"],
    padding: 0,
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    ":disabled": {
      color: vars["--ads-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--ads-opacity-disabled"],
    },
  },
  dayRegular: {
    minBlockSize: vars["--ads-control-height-md"],
  },
  dayCompact: {
    minBlockSize: 30,
  },
  dayStacked: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    justifyContent: "center",
    paddingBlock: vars["--ads-space-4"],
  },
  dayMarks: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    minBlockSize: 10,
  },
  dayMuted: {
    color: vars["--ads-color-text-subtle"],
  },
  dayOutsideDual: {
    pointerEvents: "none",
    visibility: "hidden",
  },
  dayInRange: {
    backgroundColor: vars["--ads-color-selection-fill"],
  },
  dayToday: {
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  daySelected: {
    backgroundColor: vars["--ads-color-accent"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  presets: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
});

export const densityStyles = {
  compact: styles.compact,
  regular: styles.regular,
} as const;

export const dayDensityStyles = {
  compact: styles.dayCompact,
  regular: styles.dayRegular,
} as const;
