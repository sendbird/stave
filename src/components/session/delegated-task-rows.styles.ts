import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const delegatedTaskRowsStyles = stylex.create({
  metaText: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  errorText: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-danger"],
  },
  actionsRow: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  composer: {
    marginTop: "0.375rem",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    padding: vars["--aui-space-8"],
  },
  composerLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  composerTextarea: {
    marginTop: vars["--aui-space-4"],
    minHeight: "4rem",
    resize: "vertical",
    backgroundColor: vars["--aui-color-canvas"],
    fontSize: vars["--aui-font-size-caption"],
  },
  composerActions: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  composerHint: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  // Glyph inside a control, so it takes the control-icon floor rather than a
  // raw 12px that reads as a status mark.
  actionIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  backlink: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
  },
  backlinkLabel: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: vars["--aui-color-text-muted"],
  },
  /* A parent task's title, not a chip: Micro is the badge-count step and this
     is the row's one orienting label. */
  backlinkTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  sectionRoot: { minWidth: 0 },
  sectionHeading: { fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"] },
  sectionList: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], marginTop: vars["--aui-space-4"] },
});
