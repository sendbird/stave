import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const styles = stylex.create({
  root: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-flat"],
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-12"],
    inlineSize: "min(320px, 100%)",
    minInlineSize: 0,
  },
  rootDual: {
    inlineSize: "min(656px, 100%)",
  },
  regular: {
    padding: vars["--aui-space-16"],
  },
  compact: {
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
  },
  header: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  nav: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  navButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--aui-icon-button-size"],
    justifyContent: "center",
    minBlockSize: vars["--aui-icon-button-size"],
    padding: 0,
    ":disabled": {
      color: vars["--aui-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--aui-opacity-disabled"],
    },
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    textAlign: "center",
  },
  rangeMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  panels: {
    display: "grid",
    gap: vars["--aui-space-16"],
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 680px)": "minmax(0, 1fr)",
    },
    minInlineSize: 0,
  },
  panel: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  panelTitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gap: vars["--aui-space-4"],
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    minInlineSize: 0,
  },
  weekday: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    paddingBlock: vars["--aui-space-4"],
    textAlign: "center",
  },
  day: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    cursor: "pointer",
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
    padding: 0,
    transitionDuration: {
      default: vars["--aui-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)":
        vars["--aui-motion-duration-micro"],
    },
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars["--aui-motion-ease-color"],
    ":disabled": {
      color: vars["--aui-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--aui-opacity-disabled"],
    },
  },
  dayRegular: {
    minBlockSize: vars["--aui-control-height-md"],
  },
  dayCompact: {
    minBlockSize: 30,
  },
  dayStacked: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    justifyContent: "center",
    paddingBlock: vars["--aui-space-4"],
  },
  dayMarks: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    minBlockSize: 10,
  },
  dayMuted: {
    color: vars["--aui-color-text-subtle"],
  },
  dayOutsideDual: {
    pointerEvents: "none",
    visibility: "hidden",
  },
  dayInRange: {
    backgroundColor: vars["--aui-color-selection-fill"],
  },
  dayToday: {
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  daySelected: {
    backgroundColor: vars["--aui-color-accent"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent-text"],
  },
  presets: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
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
