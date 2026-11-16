import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Item names own a full line; metadata wraps within the same item at every column width. */
export const tarsBatchStyles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
});
