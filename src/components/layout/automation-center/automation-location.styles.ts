import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const locationStyles = stylex.create({
  fields: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  },
  field: { display: "grid", gap: vars["--aui-space-8"], minInlineSize: 0 },
  picker: { inlineSize: "100%" },
  summary: {
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    margin: 0,
    rowGap: vars["--aui-space-4"],
  },
  term: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
  },
  value: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  mono: { fontFamily: vars["--aui-font-mono"] },
  noticeActions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"] },
});
