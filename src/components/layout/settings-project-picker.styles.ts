import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The project picker at the top of Settings > Projects. */
export const settingsProjectPickerStyles = stylex.create({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    marginBlockEnd: vars["--aui-space-16"],
    maxInlineSize: "28rem",
  },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  trigger: {
    inlineSize: "100%",
  },
});
