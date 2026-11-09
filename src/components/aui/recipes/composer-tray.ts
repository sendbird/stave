import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

// The tray wraps the raised input with a 4px gutter: concentric = inner + 4.
const TRAY_RADIUS = `calc(${vars["--aui-radius-frame"]} + ${vars["--aui-space-4"]})`;

/**
 * The #809 (R3 · F5) tray composer chrome, lifted out of `Composer.styles` as a
 * recipe because the host's composer is its own engine (`PromptInput`), not
 * the bundle's `Composer`. Same values: a tinted, hairline-edged band on
 * `radiusFrame + 4px` wraps the input surface with a 4px gutter; the input is a
 * raised panel (`colorRing` hairline + `elevationRaised`, `radiusFrame`) whose
 * edge steps to `colorBorderStrong` on hover and `colorBorderFocus` while
 * focused; the band carries one quiet line under the field.
 */
export const composerTray = stylex.create({
  tray: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: TRAY_RADIUS,
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
    padding: vars["--aui-space-4"],
  },
  field: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: {
      default: vars["--aui-color-ring"],
      ":focus-within": vars["--aui-color-border-focus"],
      "@media (hover: hover)": {
        default: vars["--aui-color-ring"],
        ":focus-within": vars["--aui-color-border-focus"],
        ":hover:not(:focus-within)": vars["--aui-color-border-strong"],
      },
    },
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    boxSizing: "border-box",
  },
  /** The field while its content is invalid (over a length limit). */
  fieldError: {
    borderColor: vars["--aui-color-danger-border"],
  },
  /** The band's quiet last line: caption tier, muted ink. */
  footnote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    margin: 0,
    paddingBlock: `${vars["--aui-space-4"]} ${vars["--aui-space-2"]}`,
    paddingInline: vars["--aui-space-8"],
  },
  footnoteError: {
    color: vars["--aui-color-danger-text"],
  },
});
