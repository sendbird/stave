import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const accountStyles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  stackTight: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 },
  field: { flexGrow: 1, flexBasis: 180, minWidth: 120 },
  muted: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  error: { color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-caption"] },
  /** A state the reader may need to act on, such as "Not signed in". */
  attention: { color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  identityRow: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-8"] },
  profile: { paddingBlock: 8, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border"] },
  terminal: { height: 280, minHeight: 200, overflow: "hidden", position: "relative" },
  picker: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingBlock: 4, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  pickerSelect: { width: 240, maxWidth: "100%" },
  /** A separate part of a card, ruled off from what comes before it. */
  section: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    paddingBlockStart: vars["--aui-space-16"],
  },
  /** A sub-heading inside a card: "Add an account", "Add a gateway connection". */
  subheading: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  label: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  guideIcon: { blockSize: vars["--aui-space-12"], inlineSize: vars["--aui-space-12"] },
  advancedChevron: {
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  advancedChevronOpen: { transform: "rotate(90deg)" },
  advancedPanel: { paddingBlockStart: vars["--aui-space-8"] },
});
