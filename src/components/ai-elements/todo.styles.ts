import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const todoStyles = stylex.create({
  root: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  header: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: "0.875em",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerOpen: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
  },
  headerLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  headerIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
  },
  headerCount: {
    marginLeft: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
  },
  headerMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  chevron: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  chevronOpen: { transform: "rotate(180deg)" },
  body: {
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  empty: { fontSize: "0.875em", color: vars["--ads-color-text-muted"] },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  itemIcon: {
    marginTop: vars["--ads-space-2"],
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
  },
  itemIconSuccess: { color: vars["--ads-color-success"] },
  itemIconMuted: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 50%, transparent)`,
  },
  itemIconLoader: {
    marginTop: vars["--ads-space-2"],
    color: vars["--ads-color-accent"],
  },
  itemText: {
    fontSize: "0.875em",
    lineHeight: "1.6",
  },
  itemTextCompleted: {
    color: vars["--ads-color-text-muted"],
    textDecorationLine: "line-through",
  },
  itemTextInProgress: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  itemTextInProgressFinalized: { color: vars["--ads-color-text-muted"] },
  itemTextPending: { color: vars["--ads-color-text-muted"] },
});
