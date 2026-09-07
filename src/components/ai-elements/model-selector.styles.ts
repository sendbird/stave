import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const accent10 = `color-mix(in oklch, ${vars.colorAccent} 10%, transparent)`;

export const modelSelectorStyles = stylex.create({
  root: { position: "relative" },
  trigger: {
    display: "inline-flex",
    height: vars.controlHeight,
    maxWidth: 240,
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.375rem",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    paddingInline: "0.625rem",
    fontSize: vars.fontSizeBody,
    color: vars.colorText,
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${vars.colorOverlayHover} 100%, transparent)`,
  },
  triggerLead: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "0.375rem",
  },
  triggerIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    flexShrink: 0,
  },
  triggerAccentIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    flexShrink: 0,
    color: vars.colorAccent,
  },
  triggerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerChevron: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    color: vars.colorTextMuted,
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
    borderRadius: vars.radiusPanel,
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
    borderRadius: vars.radiusControl,
    paddingBlock: "0.625rem",
  },
  optionAccentIcon: {
    width: vars.controlIconSizeMd,
    height: vars.controlIconSizeMd,
    flexShrink: 0,
    color: vars.colorAccent,
  },
  optionIcon: {
    width: vars.controlIconSizeMd,
    height: vars.controlIconSizeMd,
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
  optionLabel: { fontWeight: vars.fontWeightMedium },
  optionDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars.radiusMark,
    backgroundColor: accent10,
    paddingInline: vars.space4,
    paddingBlock: "1px",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    color: vars.colorAccent,
  },
  optionDescription: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  groupHeadingIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  effortRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  effortLabel: { fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
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
