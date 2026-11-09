import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const sessionTabStyles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  bar: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
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
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
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
    boxShadow: `inset 0 calc(-1 * ${vars["--aui-border-width-hairline"]}) 0 ${vars["--aui-color-accent"]}`,
  },
  dragging: {
    opacity: vars["--aui-opacity-disabled"],
  },
  tab: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: 0,
    paddingInline: vars["--aui-space-8"],
    whiteSpace: "nowrap",
  },
  tabActive: {
    color: vars["--aui-color-text"],
  },
  tabDisabled: {
    color: vars["--aui-color-text-subtle"],
    cursor: "not-allowed",
    opacity: vars["--aui-opacity-disabled"],
  },
  action: {
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
    justifyContent: "center",
    padding: 0,
    ":disabled": {
      color: vars["--aui-color-text-subtle"],
      cursor: "not-allowed",
      opacity: vars["--aui-opacity-disabled"],
    },
  },
  close: {
    marginInlineStart: `calc(-1 * ${vars["--aui-space-4"]})`,
    marginInlineEnd: vars["--aui-space-4"],
  },
  panelViewport: {
    minBlockSize: 96,
    minInlineSize: 0,
  },
  panel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
  },
  xs: {
    inlineSize: {
      default: vars["--aui-tree-row-height-compact"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--aui-tree-row-height-compact"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
  },
  sm: {
    inlineSize: {
      default: vars["--aui-control-height-xs"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--aui-control-height-xs"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
  },
  md: {
    inlineSize: {
      default: vars["--aui-control-height-sm"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
    minBlockSize: {
      default: vars["--aui-control-height-sm"],
      "@media (pointer: coarse)": vars["--aui-control-height-xl"],
    },
  },
});

export const sessionActionSizeStyles = {
  md: sessionTabStyles.md,
  sm: sessionTabStyles.sm,
  xs: sessionTabStyles.xs,
} as const;
