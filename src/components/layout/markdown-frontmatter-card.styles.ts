import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** Structured metadata card that stands in for raw YAML frontmatter. */
export const frontmatterStyles = stylex.create({
  card: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginBottom: vars["--ads-space-20"],
    overflow: "hidden",
  },
  header: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.08em",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
    textTransform: "uppercase",
  },
  // `divide-y` semantics: a hairline between rows, never above the first.
  row: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "minmax(5rem, 10rem) 1fr",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  key: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    overflowWrap: "anywhere",
  },
  value: { color: vars["--ads-color-text"], minWidth: 0 },
  placeholder: { color: vars["--ads-color-text-subtle"] },
  singleValue: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  valueList: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-4"] },
  chip: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    fontFamily: vars["--ads-font-mono"],
    maxWidth: "100%",
    overflowWrap: "anywhere",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: 6,
  },
});
