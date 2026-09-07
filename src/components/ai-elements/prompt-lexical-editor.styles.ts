import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { promptInputStyles } from "./prompt-input.styles";

export const lexicalEditorStyles = stylex.create({
  wrapper: {
    position: "relative",
    minInlineSize: 0,
  },
  editable: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    outline: "none",
  },
  /*
   * Overlaid on the editable, which has zero padding in both axes
   * (`promptInputStyles.editorReset`), so the placeholder pins to the same
   * origin. Everything about the *text* — family, size, leading, tracking,
   * weight — is supplied by the shared editor typography at the call site
   * (`promptEditorTypography`), never restated here: a placeholder that
   * disagrees with the first typed character is the whole defect this split
   * caused.
   */
  placeholder: {
    pointerEvents: "none",
    position: "absolute",
    insetInlineStart: 0,
    insetBlockStart: 0,
    userSelect: "none",
    color: vars.colorTextMuted,
  },
  placeholderDefaultColor: {
    color: vars.colorTextPlaceholder,
  },
  /*
   * Lexical builds its root out of real `<p>` elements. Nothing in this app's
   * reset zeroes `<p>` (the ADS reset only touches `body`), so the UA's
   * `margin-block: 1em` applied to the editor's first paragraph: on the 18px
   * default editor that is an 18px void above the caret, which is why an empty
   * focused composer drew its caret one line BELOW the placeholder — the
   * placeholder is absolutely positioned against the wrapper at `inset-block-
   * start: 0` and never saw that margin.
   *
   * Zeroing the box (and restating the leading) puts the paragraph's first
   * line and the placeholder's first line on the same baseline.
   */
  paragraph: {
    margin: 0,
    padding: 0,
    lineHeight: "inherit",
  },
});

/**
 * The single source of prompt-editor typography, shared by the Lexical
 * editable, this placeholder, and the enhancement reveal overlay. All three are
 * stacked in the same box, so any divergence in font, size, leading or tracking
 * shows up as text that jumps when the draft becomes non-empty.
 */
export const promptEditorTypography = {
  minimal: promptInputStyles.editorTypographyMinimal,
  default: promptInputStyles.editorTypographyDefault,
} as const;
