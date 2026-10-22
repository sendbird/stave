import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providerSwitchStyles = stylex.create({
  /** Aligned with the line's words: row padding + the 20px mark + the gap. */
  details: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    listStyle: "none",
    margin: 0,
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-12"],
    paddingInlineStart: `calc(${vars["--ads-space-12"]} + 20px + ${vars["--ads-space-8"]})`,
  },
  detail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
});
