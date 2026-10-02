import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const accountStyles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  stackTight: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 },
  field: { flexGrow: 1, flexBasis: 180, minWidth: 120 },
  muted: { color: vars["--ads-color-text-muted"], fontSize: 12, overflowWrap: "anywhere" },
  error: { color: vars["--ads-color-danger-text"], fontSize: 12 },
  profile: { paddingBlock: 8, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"] },
  terminal: { height: 280, minHeight: 200, overflow: "hidden", position: "relative" },
  picker: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingBlock: 4, fontSize: 12, color: vars["--ads-color-text-muted"] },
  pickerSelect: { width: 240, maxWidth: "100%" },
  /** A separate part of a card, ruled off from what comes before it. */
  section: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    paddingBlockStart: vars["--ads-space-16"],
  },
  /** A sub-heading inside a card: "Add an account", "Add a gateway connection". */
  subheading: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  guideIcon: { blockSize: vars["--ads-space-12"], inlineSize: vars["--ads-space-12"] },
  advancedChevron: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  advancedChevronOpen: { transform: "rotate(90deg)" },
  advancedPanel: { paddingBlockStart: vars["--ads-space-8"] },
});
