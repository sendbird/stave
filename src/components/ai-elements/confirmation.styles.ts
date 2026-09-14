import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const confirmationStyles = stylex.create({
  root: {
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 80%, transparent)`,
    padding: "0.625rem",
    fontSize: "0.8125rem",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  staveIcon: {
    marginTop: vars["--ads-space-2"],
    width: vars["--ads-control-icon-size-md"],
    height: vars["--ads-control-icon-size-md"],
    flexShrink: 0,
  },
  headerBody: { minWidth: 0, flex: 1 },
  toolName: { fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  descriptionClamp: {
    marginTop: vars["--ads-space-2"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  descriptionWrap: {
    marginTop: vars["--ads-space-2"],
    whiteSpace: "pre-wrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  disabledReason: {
    marginTop: "0.375rem",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  actionsRow: {
    marginTop: vars["--ads-space-8"],
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  actionComfortable: {
    minHeight: 36,
    paddingInline: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
  },
  actionCompact: {
    height: 28,
    paddingInline: "0.625rem",
    fontSize: vars["--ads-font-size-caption"],
  },
  shortcutHint: {
    marginLeft: "auto",
    fontSize: vars["--ads-font-size-micro"],
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 60%, transparent)`,
  },
  shortcutKbd: {
    marginRight: vars["--ads-space-2"],
    height: 16,
    paddingInline: vars["--ads-space-4"],
    fontSize: "0.625rem",
  },
  decisionText: {
    marginTop: "0.375rem",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
});
