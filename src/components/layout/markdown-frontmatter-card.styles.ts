import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/** Structured metadata card that stands in for raw YAML frontmatter. */
export const frontmatterStyles = stylex.create({
  card: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    marginBottom: vars["--aui-space-20"],
    overflow: "hidden",
  },
  header: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.08em",
    paddingBlock: 6,
    paddingInline: vars["--aui-space-12"],
    textTransform: "uppercase",
  },
  // `divide-y` semantics: a hairline between rows, never above the first.
  row: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: "minmax(5rem, 10rem) 1fr",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  key: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    overflowWrap: "anywhere",
  },
  value: { color: vars["--aui-color-text"], minWidth: 0 },
  placeholder: { color: vars["--aui-color-text-subtle"] },
  singleValue: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  valueList: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"] },
  chip: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "inline-flex",
    fontFamily: vars["--aui-font-mono"],
    maxWidth: "100%",
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-2"],
    paddingInline: 6,
  },
});
