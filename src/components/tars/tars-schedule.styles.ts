import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The schedules section of the tray column. It keeps the tray's hairline-row
 * grammar (as Outputs does): a schedule is a saved rule, not a run object, so
 * it is a row with its switch, never a lifted card.
 */
export const tarsScheduleStyles = stylex.create({
  list: { display: "flex", flexDirection: "column", minWidth: 0, margin: 0, paddingBlock: 0, paddingInline: vars["--aui-space-12"], listStyle: "none" },
  item: {
    display: "flex", alignItems: "flex-start", gap: vars["--aui-space-12"], minWidth: 0, paddingBlock: vars["--aui-space-8"],
    borderTopWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 }, borderTopStyle: "solid", borderTopColor: vars["--aui-color-border-subtle"],
  },
  text: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: 1, minWidth: 0 },
  title: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-normal"], overflowWrap: "anywhere" },
  line: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /** The next run is what the row is read for, so it keeps the text color. */
  next: { color: vars["--aui-color-text"], fontVariantNumeric: "tabular-nums" },
  warning: { color: vars["--aui-color-warning-text"] },
  error: { color: vars["--aui-color-danger-text"] },
  /** The switch sits on the title's line, never shrunk by a long title. */
  control: { flexShrink: 0 },
  footer: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"], minWidth: 0, paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-12"] },
  footerNote: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
});
