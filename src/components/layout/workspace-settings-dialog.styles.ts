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
  /**
   * A section, not a box. The ADS Dialog surface already supplies the one
   * content gutter (`space24`), so a bordered card here added a second inset
   * on top of it and the Label field sat 13px inside the header it should be
   * flush with. Sections are separated by the surface's own grid gap.
   */
  labelForm: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
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
  },
  /**
   * No block inset of its own: the surface grid gap already separates the tab
   * rail from the section above it, and a `paddingTop` here pushed the rail
   * down while the panel carried a second `paddingTop` — the two columns
   * started 8px apart.
   */
  tabs: {
    gap: vars.space16,
    width: "100%",
  },
  /**
   * One left inset, not two. The ADS pill track pads itself by `space4` and
   * each tab pads by `space12`, so a rail label sat 16px inside the rail box
   * while every other row in the dialog sat on the gutter. Dropping the
   * track's inline padding leaves the tab's own `space12` as the single inset
   * (the block padding stays, so the pill keeps its vertical breathing room)
   * and the selected pill spans the rail the way a rail row should.
   */
  tabsList: {
    flexShrink: 0,
    minWidth: 144,
    paddingInline: vars.space0,
  },
  tabPanel: {
    maxHeight: "60vh",
    overflowY: "auto",
  },
});
