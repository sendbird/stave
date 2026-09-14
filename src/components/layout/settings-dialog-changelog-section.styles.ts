import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Rendered CHANGELOG.md article inside the Release notes settings card. */
export const changelogSectionStyles = stylex.create({
  article: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    maxInlineSize: "none",
  },
  h2: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.01em",
    marginBlockEnd: vars["--ads-space-8"],
    marginBlockStart: {
      default: vars["--ads-space-24"],
      ":first-child": 0,
    },
    paddingBlockEnd: vars["--ads-space-8"],
  },
  h3: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.14em",
    marginBlockEnd: vars["--ads-space-4"],
    marginBlockStart: vars["--ads-space-16"],
    textTransform: "uppercase",
  },
  ul: {
    listStyleType: "disc",
    marginBlock: vars["--ads-space-8"],
    paddingInlineStart: vars["--ads-space-20"],
    "::marker": {
      color: vars["--ads-color-text-subtle"],
    },
  },
  li: {
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlock: vars["--ads-space-4"],
  },
  p: {
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlock: vars["--ads-space-8"],
  },
  code: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  link: {
    color: vars["--ads-color-accent"],
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: "2px",
  },
});
