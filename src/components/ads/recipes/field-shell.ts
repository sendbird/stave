import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Bordered text-entry anatomy. Compose after controlChrome.field and before
 * the host layout. Height, padding, wrapping and input tracks belong to the
 * host; popup/button triggers retain their focus-visible contract.
 *
 * Validity must replace the whole border ladder: a flat borderColor erases
 * focus when StyleX merges it with the base. Error text/semantics stay present
 * while the border identifies the field being edited.
 */
export const fieldShell = stylex.create({
  base: {
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  danger: {
    borderColor: {
      default: vars["--ads-color-danger-border"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
  },
  success: {
    borderColor: {
      default: vars["--ads-color-success-border"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
  },
  readOnly: {
    borderColor: {
      default: vars["--ads-color-border"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
  },
});
