import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providerModelPickerStyles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
    width: "100%",
  },
  // Narrow-control affordance: the provider is unavailable, so the row wears a
  // 1px danger status ring (emphasis, not keyboard focus).
  rootUnavailable: {
    borderRadius: vars.radiusMark,
    boxShadow: `0 0 0 ${vars.borderWidthHairline} ${vars.colorDangerBorder}`,
  },
  trigger: {
    fontSize: vars.fontSizeCaption,
    height: 32,
  },
  providerTriggerWidth: {
    flexShrink: 0,
    width: 150,
  },
  modelTriggerWidth: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  item: {
    fontSize: vars.fontSizeCaption,
  },
  itemInner: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  modelItemInner: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  icon: {
    height: vars.controlIconSizeSm,
    width: vars.controlIconSizeSm,
  },
  modelName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
