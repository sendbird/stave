import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const sessionTabStyles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--ads-space-12"],
    minInlineSize: 0,
  },
  bar: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  viewport: {
    flex: "1 1 auto",
    minInlineSize: 0,
    overflow: "hidden",
    position: "relative",
  },
  list: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    inlineSize: "100%",
    minInlineSize: 0,
    overflowX: "auto",
    scrollbarWidth: "none",
    "::-webkit-scrollbar": {
      display: "none",
    },
  },
  item: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    position: "relative",
  },
  itemActive: {
    boxShadow: `inset 0 calc(-1 * ${vars["--ads-border-width-hairline"]}) 0 ${vars["--ads-color-accent"]}`,
  },
  dragging: {
    opacity: vars["--ads-opacity-disabled"],
  },
  tab: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    whiteSpace: "nowrap",
  },
  tabActive: {
    color: vars["--ads-color-text"],
  },
  tabDisabled: {
    color: vars["--ads-color-text-subtle"],
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  action: {
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
    justifyContent: "center",
    padding: 0,
    ":disabled": {
      color: vars["--ads-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--ads-opacity-disabled"],
    },
  },
  close: {
    marginInlineStart: `calc(-1 * ${vars["--ads-space-4"]})`,
    marginInlineEnd: vars["--ads-space-4"],
  },
  panelViewport: {
    minBlockSize: 96,
    minInlineSize: 0,
  },
  panel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
  },
  xs: {
    inlineSize: {
      default: vars["--ads-tree-row-height-compact"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--ads-tree-row-height-compact"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
  },
  sm: {
    inlineSize: {
      default: vars["--ads-control-height-xs"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--ads-control-height-xs"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
  },
  md: {
    inlineSize: {
      default: vars["--ads-control-height-sm"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--ads-control-height-sm"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
  },
});

export const sessionActionSizeStyles = {
  md: sessionTabStyles.md,
  sm: sessionTabStyles.sm,
  xs: sessionTabStyles.xs,
} as const;
