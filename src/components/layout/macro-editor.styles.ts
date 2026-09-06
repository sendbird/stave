import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Macro create/edit form inside the Macros settings section. */
export const macroEditorStyles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
  },
  body: {
    minHeight: 112,
  },
  modelTrigger: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeBody,
    height: vars.controlHeightLg,
    width: "100%",
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
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "flex-end",
  },
});
