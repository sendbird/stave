import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const markerCenter = `calc((var(--aui-stepper-marker-size) - ${vars["--aui-border-width-hairline"]}) / 2)`;
const navigationMarkerCenter = `calc(${markerCenter} + ${vars["--aui-space-8"]})`;

export const styles = stylex.create({
  root: {
    color: vars["--aui-color-text"],
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  rootContent: {
    // `auto` lets the grid item stretch to its owner without the percentage /
    // intrinsic-size cycle caused by putting size containment on the root.
    inlineSize: "auto",
  },
  rootFill: {
    inlineSize: "auto",
  },
  rootHorizontal: {
    overflowX: "auto",
    scrollbarWidth: "thin",
  },
  queryContainer: {
    containerType: "inline-size",
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  rootVertical: {
    inlineSize: "100%",
  },
  rootNavigation: {
    paddingBlock: vars["--aui-space-4"],
  },
  list: {
    display: "flex",
    gap: 0,
    listStyle: "none",
    margin: 0,
    maxInlineSize: "100%",
    minInlineSize: 0,
    padding: 0,
  },
  listHorizontal: {
    flexDirection: "row",
    inlineSize: "max-content",
  },
  listVertical: {
    flexDirection: "column",
    inlineSize: "100%",
  },
  listTrackHorizontal: {
    flexDirection: {
      default: "row",
      "@container (max-width: 640px)": "column",
    },
    inlineSize: {
      default: "max-content",
      "@container (max-width: 640px)": "100%",
    },
  },
  horizontalFill: {
    inlineSize: "100%",
  },
  item: {
    boxSizing: "border-box",
    minInlineSize: 0,
    position: "relative",
    "::after": {
      backgroundColor: vars["--aui-color-border"],
      content: '""',
      display: "block",
      position: "absolute",
      // layer-ok: orders the connector behind the body and marker.
      zIndex: 0,
    },
  },
  itemLast: {
    "::after": {
      display: "none",
    },
  },
  itemNavigationLast: {
    paddingBlockEnd: 0,
    paddingInlineEnd: 0,
  },
  itemTrackHorizontal: {
    "--aui-stepper-connector-block-end": {
      default: "auto",
      "@container (max-width: 640px)": 0,
    },
    "--aui-stepper-connector-block-size": {
      default: vars["--aui-border-width-hairline"],
      "@container (max-width: 640px)":
        "calc(100% - var(--aui-stepper-marker-size))",
    },
    "--aui-stepper-connector-block-start": {
      default: markerCenter,
      "@container (max-width: 640px)": "var(--aui-stepper-marker-size)",
    },
    "--aui-stepper-connector-inline-end": {
      default: 0,
      "@container (max-width: 640px)": "auto",
    },
    "--aui-stepper-connector-inline-size": {
      default: "calc(100% - var(--aui-stepper-marker-size))",
      "@container (max-width: 640px)": vars["--aui-border-width-hairline"],
    },
    "--aui-stepper-connector-inline-start": {
      default: "var(--aui-stepper-marker-size)",
      "@container (max-width: 640px)": markerCenter,
    },
    flex: {
      default: "0 0 var(--aui-stepper-track-basis)",
      "@container (max-width: 640px)": "0 1 auto",
    },
    inlineSize: {
      default: "var(--aui-stepper-track-basis)",
      "@container (max-width: 640px)": "100%",
    },
    paddingBlockEnd: {
      default: 0,
      "@container (max-width: 640px)": vars["--aui-space-16"],
    },
    paddingInlineEnd: {
      default: vars["--aui-space-20"],
      "@container (max-width: 640px)": 0,
    },
    "::after": {
      blockSize: "var(--aui-stepper-connector-block-size)",
      inlineSize: "var(--aui-stepper-connector-inline-size)",
      insetBlockEnd: "var(--aui-stepper-connector-block-end)",
      insetBlockStart: "var(--aui-stepper-connector-block-start)",
      insetInlineEnd: "var(--aui-stepper-connector-inline-end)",
      insetInlineStart: "var(--aui-stepper-connector-inline-start)",
    },
  },
  itemTrackVertical: {
    paddingBlockEnd: vars["--aui-space-16"],
    "::after": {
      blockSize: "calc(100% - var(--aui-stepper-marker-size))",
      inlineSize: vars["--aui-border-width-hairline"],
      insetBlockEnd: 0,
      insetBlockStart: "var(--aui-stepper-marker-size)",
      insetInlineStart: markerCenter,
    },
  },
  itemNavigationHorizontal: {
    flex: "0 0 auto",
    paddingInlineEnd: vars["--aui-space-24"],
    "::after": {
      blockSize: vars["--aui-border-width-hairline"],
      inlineSize: vars["--aui-space-16"],
      insetBlockStart: "50%",
      insetInlineEnd: vars["--aui-space-4"],
    },
  },
  itemNavigationVertical: {
    paddingBlockEnd: vars["--aui-space-20"],
    "::after": {
      blockSize: vars["--aui-space-12"],
      inlineSize: vars["--aui-border-width-hairline"],
      insetBlockEnd: vars["--aui-space-4"],
      insetInlineStart: navigationMarkerCenter,
    },
  },
  itemTrackFill: {
    flex: {
      default: "1 1 0",
      "@container (max-width: 640px)": "0 1 auto",
    },
    inlineSize: {
      default: "auto",
      "@container (max-width: 640px)": "100%",
    },
  },
  itemNavigationFill: {
    flex: "1 1 0",
  },
  itemDisabled: {
    "::after": {
      backgroundColor: vars["--aui-color-border-subtle"],
    },
  },
  connectorComplete: {
    "::after": {
      backgroundColor: vars["--aui-color-accent"],
    },
  },
  body: {
    boxSizing: "border-box",
    minInlineSize: 0,
    position: "relative",
    // layer-ok: keeps the step surface and marker above its connector.
    zIndex: 1,
  },
  bodyTrack: {
    alignItems: "start",
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "var(--aui-stepper-marker-size) minmax(0, 1fr)",
  },
  bodyNavigation: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "var(--aui-stepper-marker-size) minmax(0, 1fr)",
    overflow: "hidden",
  },
  bodyStatic: {
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  bodyNavigationComplete: {
    borderColor: vars["--aui-color-border-strong"],
  },
  bodyNavigationCurrent: {
    backgroundColor: vars["--aui-color-selection-fill"],
    borderColor: vars["--aui-color-accent"],
  },
  bodyNavigationError: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
  },
  bodyDisabled: {
    opacity: vars["--aui-opacity-disabled"],
  },
  marker: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-full"],
    boxSizing: "border-box",
    display: "inline-flex",
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
    justifyContent: "center",
    position: "relative",
  },
  complete: {
    backgroundColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent-text"],
  },
  current: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-accent"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-accent"],
  },
  pending: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
  },
  error: {
    backgroundColor: vars["--aui-color-danger-soft"],
    color: vars["--aui-color-danger-text"],
  },
  markerDisabled: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text-subtle"],
  },
  copy: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  copyTrackHorizontal: {
    gridColumn: {
      default: "1 / -1",
      "@container (max-width: 640px)": "2",
    },
    paddingBlockStart: {
      default: vars["--aui-space-8"],
      "@container (max-width: 640px)": 0,
    },
  },
  copyNavigation: {
    alignSelf: "center",
    gap: 0,
  },
  label: {
    fontSize: "inherit",
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    overflowWrap: "anywhere",
  },
  labelComplete: {
    color: vars["--aui-color-text-muted"],
  },
  labelCurrent: {
    color: vars["--aui-color-text"],
  },
  labelPending: {
    color: vars["--aui-color-text-muted"],
  },
  labelError: {
    color: vars["--aui-color-danger-text"],
  },
  labelDisabled: {
    color: vars["--aui-color-text-muted"],
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  descriptionNavigation: {
    blockSize: 1,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  // Host: `showDescriptions` on a navigation chip. The status line sits on
  // the title's left edge, one tight line under it, and wraps rather than
  // clips, so a long count is never cut.
  descriptionNavigationShown: {
    lineHeight: vars["--aui-line-height-tight"],
    overflowWrap: "anywhere",
  },
  trigger: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      ":disabled": "transparent",
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars["--aui-color-overlay-pressed"],
        ":disabled": "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
      },
    },
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: 0,
    color: "inherit",
    cursor: {
      default: "pointer",
      ":disabled": "not-allowed",
    },
    fontFamily: "inherit",
    inlineSize: "100%",
    minInlineSize: 0,
    textAlign: "start",
  },
  triggerTrack: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridColumn: "1 / -1",
    gridTemplateColumns: "var(--aui-stepper-marker-size) minmax(0, 1fr)",
    padding: vars["--aui-space-4"],
  },
  triggerNavigation: {
    alignItems: "center",
    display: "grid",
    gap: vars["--aui-space-8"],
    gridColumn: "1 / -1",
    gridTemplateColumns: "var(--aui-stepper-marker-size) minmax(0, 1fr)",
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
});

export const listOrientationStyles = {
  horizontal: styles.listHorizontal,
  vertical: styles.listVertical,
} as const;

export const itemVariantStyles = {
  navigation: null,
  track: null,
} as const;

export const itemOrientationStyles = {
  navigation: {
    horizontal: styles.itemNavigationHorizontal,
    vertical: styles.itemNavigationVertical,
  },
  track: {
    horizontal: styles.itemTrackHorizontal,
    vertical: styles.itemTrackVertical,
  },
} as const;

export const itemDistributionStyles = {
  navigation: {
    content: null,
    fill: styles.itemNavigationFill,
  },
  track: {
    content: null,
    fill: styles.itemTrackFill,
  },
} as const;

export const bodyVariantStyles = {
  navigation: styles.bodyNavigation,
  track: styles.bodyTrack,
} as const;

export const bodyNavigationStatusStyles = {
  complete: styles.bodyNavigationComplete,
  current: styles.bodyNavigationCurrent,
  error: styles.bodyNavigationError,
  pending: null,
} as const;

export const markerVariantStyles = {
  navigation: null,
  track: null,
} as const;

export const markerStyles = {
  complete: styles.complete,
  current: styles.current,
  error: styles.error,
  pending: styles.pending,
} as const;

export const contentVariantStyles = {
  navigation: styles.copyNavigation,
  track: null,
} as const;

export const labelStyles = {
  complete: styles.labelComplete,
  current: styles.labelCurrent,
  error: styles.labelError,
  pending: styles.labelPending,
} as const;

export const triggerVariantStyles = {
  navigation: styles.triggerNavigation,
  track: styles.triggerTrack,
} as const;
