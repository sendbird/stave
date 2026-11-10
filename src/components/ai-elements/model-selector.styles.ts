import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

const accent10 = `color-mix(in oklch, ${vars["--aui-color-accent"]} 10%, transparent)`;

export const modelSelectorStyles = stylex.create({
  root: { position: "relative" },
  trigger: {
    display: "inline-flex",
    height: vars["--aui-control-height"],
    maxWidth: 240,
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.375rem",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    paddingInline: "0.625rem",
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text"],
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-overlay-hover"]} 100%, transparent)`,
  },
  triggerLead: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "0.375rem",
  },
  triggerIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
  },
  triggerAccentIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
    color: vars["--aui-color-accent"],
  },
  triggerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerChevron: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
  },
  /**
   * Flush surface. Passed as `xstyle` (never `className`) so `padding: 0`
   * lands in the SAME `stylex.props` call as `overlayLayout.dialog`'s
   * `padding: space24` and wins it by last-write dedupe. Delivered through
   * `className` it was a separate class list, the 24px survived on emission
   * order, and the command frame's own gutters stacked on top of it — the
   * thick inset ring around the search field and the option rows.
   *
   * `maxInlineSize` restates the narrow-viewport default explicitly rather
   * than nulling it: a `null` default would dedupe the shim's `28rem` away
   * and let the dialog span the viewport below 640px.
   */
  dialogContent: {
    overflow: "hidden",
    borderRadius: vars["--aui-radius-panel"],
    // `gap` goes with `padding`: the shim's `space24` track gap sat between the
    // screen-reader-only header row and the command frame, so a flush surface
    // that only zeroed `padding` still opened with a 24px band above the search
    // field.
    gap: 0,
    padding: 0,
    maxInlineSize: { default: "28rem", "@media (min-width: 640px)": "32rem" },
  },
  command: {
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  // Height cap only. The list gutter is `Command.styles.list`'s `space4`;
  // restating it here made it the second of two owners.
  commandList: {
    maxHeight: "17.5rem",
  },
  // Row height and the icon/copy gap are this surface's (its rows carry a
  // description line). The inline gutter is the AUI item's `space8`, so the
  // row edge lines up with the group heading and the list padding.
  optionItem: {
    gap: 0,
    borderRadius: vars["--aui-radius-control"],
    paddingBlock: vars["--aui-space-8"],
  },
  optionContent: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-12"], flex: 1, minWidth: 0 },
  optionMark: { display: "flex", alignItems: "center", blockSize: "1lh", flexShrink: 0 },
  optionAccentIcon: {
    width: vars["--aui-control-icon-size-md"],
    height: vars["--aui-control-icon-size-md"],
    flexShrink: 0,
    color: vars["--aui-color-accent"],
  },
  optionIcon: {
    width: vars["--aui-control-icon-size-md"],
    height: vars["--aui-control-icon-size-md"],
    flexShrink: 0,
  },
  optionBody: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
  },
  optionTitleRow: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: vars["--aui-space-8"], minWidth: 0 },
  optionLabel: { fontWeight: vars["--aui-font-weight-medium"], minWidth: 0, overflowWrap: "anywhere" },
  // The price has its own column; long notices wrap without leaving an orphan price row.
  optionPrice: { justifySelf: "end" },
  optionDescriptionLine: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "baseline", columnGap: vars["--aui-space-8"], minWidth: 0 },
  optionDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-mark"],
    backgroundColor: accent10,
    paddingInline: vars["--aui-space-4"],
    paddingBlock: "1px",
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-accent"],
  },
  /** A caution beside the label, such as a model that is experimental on this runtime. */
  optionNoticeBadge: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-mark"],
    backgroundColor: vars["--aui-color-warning-soft"],
    paddingInline: vars["--aui-space-4"],
    paddingBlock: "1px",
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-warning-text"],
  },
  optionDescription: { minWidth: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  /** The sub-group name beside the runtime, such as "Company gateway · API billing". */
  groupHeadingMeta: {
    color: vars["--aui-color-text-muted"],
    fontWeight: vars["--aui-font-weight-regular"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  groupHeadingIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
  },
  effortRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
  },
  effortLabel: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
