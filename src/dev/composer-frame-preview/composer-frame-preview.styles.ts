import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only composer frame preview root. */
export const composerFramePreviewStyles = stylex.create({
  page: {
    backgroundColor: vars.colorCanvas,
    color: vars.colorText,
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space16,
  },
  headerTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  headerNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  headerControls: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    marginInlineStart: "auto",
  },
  toggle: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    paddingBlock: vars.space4,
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    color: vars.colorText,
  },
  statusNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  main: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    position: "relative",
  },
  conversation: {
    color: vars.colorTextMuted,
    display: "flex",
    flex: 1,
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    justifyContent: "flex-end",
    minHeight: 0,
    overflow: "hidden",
    paddingBlock: vars.space24,
    paddingInline: vars.space16,
  },
  conversationMeasure: {
    marginInline: "auto",
    paddingInline: vars.space12,
    width: "100%",
    maxWidth: "72rem",
    "@media (min-width: 40rem)": {
      paddingInline: vars.space20,
    },
  },
  conversationBody: {
    color: vars.colorText,
    marginTop: vars.space12,
    maxWidth: "42rem",
  },
  composerDock: {
    flexShrink: 0,
    position: "relative",
    zIndex: vars.zIndexAppChrome,
  },
  composerPad: {
    backgroundColor: vars.colorCanvas,
    paddingBlock: 10,
    paddingInline: vars.space12,
    "@media (min-width: 40rem)": {
      paddingInline: vars.space16,
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
