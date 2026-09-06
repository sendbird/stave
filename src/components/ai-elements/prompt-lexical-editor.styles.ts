import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const lexicalEditorStyles = stylex.create({
  wrapper: {
    position: "relative",
    minWidth: 0,
  },
  editable: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    outline: "none",
  },
  placeholder: {
    pointerEvents: "none",
    position: "absolute",
    left: 0,
    top: 0,
    userSelect: "none",
    color: vars.colorTextMuted,
  },
  placeholderMinimal: {
    fontFamily: vars.fontMono,
    fontSize: "15px",
    lineHeight: "1.75rem",
  },
  placeholderDefault: {
    fontSize: "15px",
    fontWeight: vars.fontWeightRegular,
    lineHeight: "1.5rem",
    letterSpacing: "normal",
    color: vars.colorTextPlaceholder,
  },
});
