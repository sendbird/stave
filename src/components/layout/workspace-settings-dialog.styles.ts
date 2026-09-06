import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** The dialog widens once there is room for the label row to sit on one line. */
const WIDE = "@media (min-width: 40rem)";

export const workspaceSettingsDialogStyles = stylex.create({
  surface: {
    maxWidth: {
      default: null,
      [WIDE]: "56rem",
    },
  },
  staticSurface: {
    maxWidth: "56rem",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  headerTitle: {
    // Matches the reset heading it replaces: the size comes from the dialog.
    fontFamily: vars.fontSans,
    fontSize: "inherit",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
  },
  headerMeta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    paddingTop: vars.space4,
  },
  headerName: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  headerPath: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    paddingTop: vars.space4,
    wordBreak: "break-all",
  },
  labelForm: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  labelRow: {
    alignItems: {
      default: null,
      [WIDE]: "flex-end",
    },
    display: "flex",
    flexDirection: {
      default: "column",
      [WIDE]: "row",
    },
    gap: vars.space8,
  },
  labelField: {
    color: vars.colorTextMuted,
    flexBasis: 0,
    flexGrow: 1,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    minWidth: 0,
  },
  labelInput: {
    backgroundColor: vars.colorCanvas,
    height: 32,
    marginTop: vars.space4,
  },
  labelSubmit: {
    height: 32,
  },
  labelHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space8,
  },
  tabs: {
    gap: vars.space16,
    paddingTop: vars.space8,
    width: "100%",
  },
  tabsList: {
    flexShrink: 0,
    minWidth: 144,
  },
  tabPanel: {
    maxHeight: "60vh",
    overflowY: "auto",
    paddingTop: vars.space8,
  },
});
