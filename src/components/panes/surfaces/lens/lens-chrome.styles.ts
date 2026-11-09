import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../aui/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const chromeStyles = stylex.create({
  toolbar: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border-subtle"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
  },
  /** A run of controls that never splits across rows. */
  group: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-2"],
  },
  /**
   * The page tools. When they no longer fit beside the address bar they wrap
   * as one block and stay at the trailing edge of their own row; in a pane too
   * narrow even for that block they wrap within it, so the last control (full
   * view) is never clipped.
   */
  trailing: {
    marginLeft: "auto",
    flexShrink: 1,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    minWidth: 0,
    rowGap: vars["--aui-space-4"],
  },
  /**
   * Grows into the row, and gives way to a second row before it drops below a
   * width that still shows a host and the start of a path. The basis is what
   * decides the wrap, so it carries the floor too: 14rem keeps the 640px split
   * on one row and moves the address to its own row below about 350px. Never
   * wider than the toolbar, so a very narrow pane gets a full-width address
   * row instead of an overflowing one.
   */
  addressForm: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "14rem",
    minWidth: "min(14rem, 100%)",
  },
  address: {
    height: vars["--aui-control-height-sm"],
    overflow: "hidden",
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 80%, transparent)`,
      ":focus-within": vars["--aui-color-canvas"],
    },
  },
  addressStart: {
    paddingLeft: vars["--aui-space-8"],
    color: vars["--aui-color-text-muted"],
  },
  addressSpinner: {
    animationName: spin,
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  addressInput: {
    backgroundColor: "transparent",
    fontSize: vars["--aui-font-size-body"],
    textOverflow: "ellipsis",
  },
  addressEnd: { paddingRight: vars["--aui-space-2"] },
  compactIcon: { width: 14, height: 14 },
  /**
   * Preview / console / network. One control height tall, so it lines up with
   * the address bar and the icon buttons beside it.
   */
  modes: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-2"],
    boxSizing: "border-box",
    height: vars["--aui-control-height-sm"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas"],
    paddingInline: vars["--aui-space-2"],
  },
  modeTab: {
    height: `calc(${vars["--aui-control-height-sm"]} - ${vars["--aui-space-4"]} - 2 * ${vars["--aui-border-width-hairline"]})`,
    gap: vars["--aui-space-4"],
  },
  modeTabActive: {
    backgroundColor: {
      default: vars["--aui-color-accent-soft"],
      ":hover": vars["--aui-color-accent-soft"],
    },
    color: vars["--aui-color-accent"],
  },
  modeCount: {
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  help: { maxWidth: "16rem", textWrap: "pretty" },
  downloadsMenu: { width: "18rem" },
  downloadRow: { minWidth: 0 },
  downloadName: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  downloadSize: {
    marginLeft: vars["--aui-space-8"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  toolActive: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: {
      default: vars["--aui-color-accent-soft"],
      ":hover": vars["--aui-color-accent-soft"],
    },
    color: vars["--aui-color-accent"],
    boxShadow: vars["--aui-elevation-raised"],
  },
  toolInactive: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
  },
  toolIcon: { width: vars["--aui-space-16"], height: vars["--aui-space-16"] },
});
