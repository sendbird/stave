import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only composer frame preview root. */
export const composerFramePreviewStyles = stylex.create({
  page: {
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  headerTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  headerControls: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    marginInlineStart: "auto",
  },
  toggle: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-text"],
  },
  statusNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  main: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    position: "relative",
  },
  conversation: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flex: 1,
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    justifyContent: "flex-end",
    minHeight: 0,
    overflow: "hidden",
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-16"],
  },
  conversationMeasure: {
    marginInline: "auto",
    paddingInline: vars["--ads-space-12"],
    width: "100%",
    maxWidth: "72rem",
    "@media (min-width: 40rem)": {
      paddingInline: vars["--ads-space-20"],
    },
  },
  conversationBody: {
    color: vars["--ads-color-text"],
    marginTop: vars["--ads-space-12"],
    maxWidth: "42rem",
  },
  composerDock: {
    flexShrink: 0,
    position: "relative",
    zIndex: vars["--ads-z-index-app-chrome"],
  },
  composerPad: {
    backgroundColor: vars["--ads-color-canvas"],
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
    "@media (min-width: 40rem)": {
      paddingInline: vars["--ads-space-16"],
    },
  },
  composerMeasure: {
    marginInline: "auto",
  },
  composerMeasureWide: {
    maxWidth: "72rem",
  },
  composerMeasureSqueezed: {
    maxWidth: 820,
  },
});
