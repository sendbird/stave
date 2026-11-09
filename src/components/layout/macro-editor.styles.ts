import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Macro create/edit form inside the Macros settings section. */
export const macroEditorStyles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
  },
  body: {
    minHeight: 112,
  },
  modelTrigger: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontSize: vars["--aui-font-size-body"],
    height: vars["--aui-control-height-lg"],
    width: "100%",
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-body"],
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
  },
});
