import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnActivityHistoryStyles = stylex.create({
  bar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  label: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  picker: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    minWidth: 0,
  },
  body: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
});
