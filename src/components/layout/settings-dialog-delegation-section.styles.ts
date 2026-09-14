import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const delegationStyles = stylex.create({
  panel: {
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  panelHeading: {
    marginBlock: 0,
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  emphasis: {
    color: vars["--ads-color-text"],
  },
  list: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
    paddingInlineStart: 0,
    listStyle: "none",
    display: "grid",
    gap: vars["--ads-space-4"],
  },
  paragraphSpaced: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
  },
  paragraphTight: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
  },
  detailList: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
    paddingInlineStart: 0,
    listStyle: "none",
    display: "grid",
    gap: vars["--ads-space-4"],
  },
  openSettingsLink: {
    marginBlockStart: vars["--ads-space-4"],
    display: "block",
    textAlign: "left",
    fontSize: vars["--ads-font-size-caption"],
    textUnderlineOffset: 2,
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  code: {
    marginInline: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text"],
  },
  codeInline: {
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text"],
  },
  requiredTag: {
    fontSize: vars["--ads-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
});
