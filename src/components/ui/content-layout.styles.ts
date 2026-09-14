import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const contentLayout = stylex.create({
  externalLink: { color: vars["--ads-color-accent"], textDecorationLine: "underline", textUnderlineOffset: 2, overflowWrap: "anywhere" },
  ellipsis: { display: "flex", width: vars["--ads-space-20"], height: vars["--ads-space-20"], alignItems: "center", justifyContent: "center" },
  ellipsisIcon: { width: vars["--ads-space-16"], height: vars["--ads-space-16"] },
  serviceLogo: { height: "1em", width: "auto", flexShrink: 0 },
  serviceIcon: { height: "1em", width: "1em", flexShrink: 0 },
  serviceBadge: {
    display: "inline-flex", maxWidth: "100%", alignItems: "center", gap: "0.35em",
    borderRadius: vars["--ads-radius-control"], borderWidth: vars["--ads-border-width-hairline"], borderStyle: "solid", borderColor: vars["--ads-color-border"],
    backgroundColor: { default: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 40%, transparent)`, ":hover": vars["--ads-color-surface-tint"] },
    paddingInline: "0.45em", paddingBlock: "0.1em", verticalAlign: "middle", fontSize: "0.8125em",
    fontWeight: vars["--ads-font-weight-medium"], lineHeight: 1, color: vars["--ads-color-text"], textDecorationLine: "none",
  },
  serviceLabel: { minWidth: 0, maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  externalIcon: { width: "0.9em", height: "0.9em", flexShrink: 0, color: vars["--ads-color-text-muted"] },
  serviceTooltip: { maxWidth: "24rem", wordBreak: "break-all" },
});
