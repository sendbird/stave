import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";

export const typeRoles = stylex.create({
  caption: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"] },
  eyebrow: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], fontWeight: vars["--aui-font-weight-semibold"], textTransform: "uppercase", letterSpacing: vars["--aui-letter-spacing-eyebrow"] },
  /**
   * #809 (R0 · S2) interface row: 13px on a 20px line, for a row or control
   * label inside a panel. Upstream made this the body size; the host keeps a
   * 14px body and opts surfaces into the row role.
   */
  row: { fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  /** #809 (R0 · S2) in-surface section title: 15/500 on the tight ratio. */
  section: { fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"] },
  /** #809 reading copy: the 14px body on the 22px prose line. */
  prose: { fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-prose"] },
});
