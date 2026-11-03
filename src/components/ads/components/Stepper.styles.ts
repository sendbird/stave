import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const markerCenter = `calc((var(--ads-stepper-marker-size) - ${vars["--ads-border-width-hairline"]}) / 2)`;
const navigationMarkerCenter = `calc(${markerCenter} + ${vars["--ads-space-8"]})`;

export const styles = stylex.create({
  root: {
    color: vars["--ads-color-text"],
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
    paddingBlock: vars["--ads-space-4"],
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
      backgroundColor: vars["--ads-color-border"],
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
    "--ads-stepper-connector-block-end": {
      default: "auto",
      "@container (max-width: 640px)": 0,
    },
    "--ads-stepper-connector-block-size": {
      default: vars["--ads-border-width-hairline"],
      "@container (max-width: 640px)":
        "calc(100% - var(--ads-stepper-marker-size))",
    },
    "--ads-stepper-connector-block-start": {
      default: markerCenter,
      "@container (max-width: 640px)": "var(--ads-stepper-marker-size)",
    },
    "--ads-stepper-connector-inline-end": {
      default: 0,
      "@container (max-width: 640px)": "auto",
    },
    "--ads-stepper-connector-inline-size": {
      default: "calc(100% - var(--ads-stepper-marker-size))",
      "@container (max-width: 640px)": vars["--ads-border-width-hairline"],
    },
    "--ads-stepper-connector-inline-start": {
      default: "var(--ads-stepper-marker-size)",
      "@container (max-width: 640px)": markerCenter,
    },
    flex: {
      default: "0 0 var(--ads-stepper-track-basis)",
      "@container (max-width: 640px)": "0 1 auto",
    },
    inlineSize: {
      default: "var(--ads-stepper-track-basis)",
      "@container (max-width: 640px)": "100%",
    },
    paddingBlockEnd: {
      default: 0,
      "@container (max-width: 640px)": vars["--ads-space-16"],
    },
    paddingInlineEnd: {
      default: vars["--ads-space-20"],
      "@container (max-width: 640px)": 0,
    },
    "::after": {
      blockSize: "var(--ads-stepper-connector-block-size)",
      inlineSize: "var(--ads-stepper-connector-inline-size)",
      insetBlockEnd: "var(--ads-stepper-connector-block-end)",
      insetBlockStart: "var(--ads-stepper-connector-block-start)",
      insetInlineEnd: "var(--ads-stepper-connector-inline-end)",
      insetInlineStart: "var(--ads-stepper-connector-inline-start)",
    },
  },
  itemTrackVertical: {
    paddingBlockEnd: vars["--ads-space-16"],
    "::after": {
      blockSize: "calc(100% - var(--ads-stepper-marker-size))",
      inlineSize: vars["--ads-border-width-hairline"],
      insetBlockEnd: 0,
      insetBlockStart: "var(--ads-stepper-marker-size)",
      insetInlineStart: markerCenter,
    },
  },
  itemNavigationHorizontal: {
    flex: "0 0 auto",
    paddingInlineEnd: vars["--ads-space-24"],
    "::after": {
      blockSize: vars["--ads-border-width-hairline"],
      inlineSize: vars["--ads-space-16"],
      insetBlockStart: "50%",
      insetInlineEnd: vars["--ads-space-4"],
    },
  },
  itemNavigationVertical: {
    paddingBlockEnd: vars["--ads-space-20"],
    "::after": {
      blockSize: vars["--ads-space-12"],
      inlineSize: vars["--ads-border-width-hairline"],
      insetBlockEnd: vars["--ads-space-4"],
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
      backgroundColor: vars["--ads-color-border-subtle"],
    },
  },
  connectorComplete: {
    "::after": {
      backgroundColor: vars["--ads-color-accent"],
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
    gap: vars["--ads-space-8"],
    gridTemplateColumns: "var(--ads-stepper-marker-size) minmax(0, 1fr)",
  },
  bodyNavigation: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: "var(--ads-stepper-marker-size) minmax(0, 1fr)",
    overflow: "hidden",
  },
  bodyStatic: {
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  bodyNavigationComplete: {
    borderColor: vars["--ads-color-border-strong"],
  },
  bodyNavigationCurrent: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: vars["--ads-color-accent"],
  },
  bodyNavigationError: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
  },
  bodyDisabled: {
    opacity: vars["--ads-opacity-disabled"],
  },
  marker: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-full"],
    boxSizing: "border-box",
    display: "inline-flex",
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
    justifyContent: "center",
    position: "relative",
  },
  complete: {
    backgroundColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  current: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-accent"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-accent"],
  },
  pending: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
  },
  error: {
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger-text"],
  },
  markerDisabled: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    color: vars["--ads-color-text-subtle"],
  },
  copy: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  copyTrackHorizontal: {
    gridColumn: {
      default: "1 / -1",
      "@container (max-width: 640px)": "2",
    },
    paddingBlockStart: {
      default: vars["--ads-space-8"],
      "@container (max-width: 640px)": 0,
    },
  },
  copyNavigation: {
    alignSelf: "center",
    gap: 0,
  },
  label: {
    fontSize: "inherit",
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    overflowWrap: "anywhere",
  },
  labelComplete: {
    color: vars["--ads-color-text-muted"],
  },
  labelCurrent: {
    color: vars["--ads-color-text"],
  },
  labelPending: {
    color: vars["--ads-color-text-muted"],
  },
  labelError: {
    color: vars["--ads-color-danger-text"],
  },
  labelDisabled: {
    color: vars["--ads-color-text-muted"],
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
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
  trigger: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      ":disabled": "transparent",
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars["--ads-color-overlay-pressed"],
        ":disabled": "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
      },
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
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
    gap: vars["--ads-space-8"],
    gridColumn: "1 / -1",
    gridTemplateColumns: "var(--ads-stepper-marker-size) minmax(0, 1fr)",
    padding: vars["--ads-space-4"],
  },
  triggerNavigation: {
    alignItems: "center",
    display: "grid",
    gap: vars["--ads-space-8"],
    gridColumn: "1 / -1",
    gridTemplateColumns: "var(--ads-stepper-marker-size) minmax(0, 1fr)",
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
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
