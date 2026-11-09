import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const providerSwitchStyles = stylex.create({
  /** Aligned with the line's words: row padding + the 20px mark + the gap. */
  details: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    listStyle: "none",
    margin: 0,
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: `calc(${vars["--aui-space-12"]} + 20px + ${vars["--aui-space-8"]})`,
  },
  detail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
});
