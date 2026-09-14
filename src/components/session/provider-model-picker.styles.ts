import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providerModelPickerStyles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    width: "100%",
  },
  // Narrow-control affordance: the provider is unavailable, so the row wears a
  // 1px danger status ring (emphasis, not keyboard focus).
  rootUnavailable: {
    borderRadius: vars["--ads-radius-mark"],
    boxShadow: `0 0 0 ${vars["--ads-border-width-hairline"]} ${vars["--ads-color-danger-border"]}`,
  },
  trigger: {
    fontSize: vars["--ads-font-size-caption"],
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
    fontSize: vars["--ads-font-size-caption"],
  },
  itemInner: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  modelItemInner: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  icon: {
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  modelName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
