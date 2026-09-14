import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const accent10 = `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`;

export const modelSelectorStyles = stylex.create({
  root: { position: "relative" },
  trigger: {
    display: "inline-flex",
    height: vars["--ads-control-height"],
    maxWidth: 240,
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.375rem",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    paddingInline: "0.625rem",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-overlay-hover"]} 100%, transparent)`,
  },
  triggerLead: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "0.375rem",
  },
  triggerIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
  },
  triggerAccentIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    color: vars["--ads-color-accent"],
  },
  triggerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerChevron: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
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
    borderRadius: vars["--ads-radius-panel"],
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
  // description line). The inline gutter is the ADS item's `space8`, so the
  // row edge lines up with the group heading and the list padding.
  optionItem: {
    gap: "0.75rem",
    borderRadius: vars["--ads-radius-control"],
    paddingBlock: "0.625rem",
  },
  optionAccentIcon: {
    width: vars["--ads-control-icon-size-md"],
    height: vars["--ads-control-icon-size-md"],
    flexShrink: 0,
    color: vars["--ads-color-accent"],
  },
  optionIcon: {
    width: vars["--ads-control-icon-size-md"],
    height: vars["--ads-control-icon-size-md"],
    flexShrink: 0,
  },
  optionBody: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
  },
  optionTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionLabel: { fontWeight: vars["--ads-font-weight-medium"] },
  optionDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: accent10,
    paddingInline: vars["--ads-space-4"],
    paddingBlock: "1px",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-accent"],
  },
  optionDescription: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  groupHeadingIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  effortRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  effortLabel: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
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
