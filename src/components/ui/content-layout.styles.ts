import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const contentLayout = stylex.create({
  externalLink: { color: vars["--aui-color-accent"], textDecorationLine: "underline", textUnderlineOffset: 2, overflowWrap: "anywhere" },
  ellipsis: { display: "flex", width: vars["--aui-space-20"], height: vars["--aui-space-20"], alignItems: "center", justifyContent: "center" },
  ellipsisIcon: { width: vars["--aui-space-16"], height: vars["--aui-space-16"] },
  serviceLogo: { height: "1em", width: "auto", flexShrink: 0 },
  serviceIcon: { height: "1em", width: "1em", flexShrink: 0 },
  serviceBadge: {
    display: "inline-flex", maxWidth: "100%", alignItems: "center", gap: "0.35em",
    borderRadius: vars["--aui-radius-control"], borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    backgroundColor: { default: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 40%, transparent)`, ":hover": vars["--aui-color-surface-tint"] },
    paddingInline: "0.45em", paddingBlock: "0.1em", verticalAlign: "middle", fontSize: "0.8125em",
    fontWeight: vars["--aui-font-weight-medium"], lineHeight: 1, color: vars["--aui-color-text"], textDecorationLine: "none",
  },
  serviceLabel: { minWidth: 0, maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  externalIcon: { width: "0.9em", height: "0.9em", flexShrink: 0, color: vars["--aui-color-text-muted"] },
  serviceTooltip: { maxWidth: "24rem", wordBreak: "break-all" },
});
