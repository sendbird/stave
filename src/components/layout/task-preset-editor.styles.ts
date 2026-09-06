import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Task/CLI preset create/edit form inside the Presets settings section. */
export const taskPresetEditorStyles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  label: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  option: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  optionIcon: {
    height: 14,
    width: 14,
  },
  optionLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "flex-end",
    paddingBlockStart: vars.space4,
  },
});
