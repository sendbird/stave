import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/** Settings > Integrations > Remote control. */
export const remoteControlStyles = stylex.create({
  status: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    overflowWrap: "anywhere",
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
  fullWidth: {
    inlineSize: "100%",
  },
  pairActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  pairing: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
  },
  pairingLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  pairingValueRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  pairingValue: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
    userSelect: "all",
  },
  actionIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  list: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  rowBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  rowTitle: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowAside: {
    flexShrink: 0,
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
});
