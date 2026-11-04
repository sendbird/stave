import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";

export const typeRoles = stylex.create({
  caption: { fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-caption"] },
  eyebrow: { fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-caption"], fontWeight: vars["--ads-font-weight-semibold"], textTransform: "uppercase", letterSpacing: vars["--ads-letter-spacing-eyebrow"] },
});
