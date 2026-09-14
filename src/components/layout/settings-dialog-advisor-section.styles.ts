import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Advisor default settings card controls. */
export const advisorSectionStyles = stylex.create({
  providerIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  selector: {
    inlineSize: "100%",
  },
  trigger: {
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxInlineSize: "32rem",
    },
  },
  invalidNote: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-8"],
  },
  clampNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-8"],
  },
  consultInput: {
    backgroundColor: vars["--ads-color-canvas"],
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "6rem",
  },
  noteCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  emphasis: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  noteSpacer: {
    marginBlockStart: vars["--ads-space-4"],
  },
});
