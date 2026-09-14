import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Macro create/edit form inside the Macros settings section. */
export const macroEditorStyles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
  },
  body: {
    minHeight: 112,
  },
  modelTrigger: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    fontSize: vars["--ads-font-size-body"],
    height: vars["--ads-control-height-lg"],
    width: "100%",
  },
  option: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
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
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
  },
});
