import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";

export const typeRoles = stylex.create({
  caption: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"] },
  eyebrow: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], fontWeight: vars["--aui-font-weight-semibold"], textTransform: "uppercase", letterSpacing: vars["--aui-letter-spacing-eyebrow"] },
});
