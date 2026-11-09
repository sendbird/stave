import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

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
    gap: vars["--aui-space-8"],
  },
  headerTitle: {
    // Matches the reset heading it replaces: the size comes from the dialog.
    fontFamily: vars["--aui-font-sans"],
    fontSize: "inherit",
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: 1,
  },
  headerMeta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    paddingTop: vars["--aui-space-4"],
  },
  headerName: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  headerPath: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingTop: vars["--aui-space-4"],
    wordBreak: "break-all",
  },
  /**
   * A section, not a box. The AUI Dialog surface already supplies the one
   * content gutter (`space24`), so a bordered card here added a second inset
   * on top of it and the Label field sat 13px inside the header it should be
   * flush with. Sections are separated by the surface's own grid gap.
   */
  labelForm: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
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
    gap: vars["--aui-space-8"],
  },
  labelField: {
    color: vars["--aui-color-text-muted"],
    flexBasis: 0,
    flexGrow: 1,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
  },
  labelInput: {
    backgroundColor: vars["--aui-color-canvas"],
    height: 32,
    marginTop: vars["--aui-space-4"],
  },
  labelSubmit: {
    height: 32,
  },
  labelHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  /**
   * No block inset of its own: the surface grid gap already separates the tab
   * rail from the section above it, and a `paddingTop` here pushed the rail
   * down while the panel carried a second `paddingTop` — the two columns
   * started 8px apart.
   */
  tabs: {
    gap: vars["--aui-space-16"],
    width: "100%",
  },
  /**
   * One left inset, not two. The AUI pill track pads itself by `space4` and
   * each tab pads by `space12`, so a rail label sat 16px inside the rail box
   * while every other row in the dialog sat on the gutter. Dropping the
   * track's inline padding leaves the tab's own `space12` as the single inset
   * (the block padding stays, so the pill keeps its vertical breathing room)
   * and the selected pill spans the rail the way a rail row should.
   */
  tabsList: {
    flexShrink: 0,
    minWidth: 144,
    paddingInline: vars["--aui-space-0"],
  },
  tabPanel: {
    maxHeight: "60vh",
    overflowY: "auto",
  },
});
