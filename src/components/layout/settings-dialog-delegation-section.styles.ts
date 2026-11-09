import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Delegated tasks card: one status line per provider, then the fix when blocked. */
export const delegationStyles = stylex.create({
  status: {
    color: vars["--aui-color-text-muted"],
    display: "grid",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  list: {
    display: "grid",
    gap: vars["--aui-space-4"],
    listStyle: "none",
    marginBlock: 0,
    paddingInlineStart: 0,
  },
  emphasis: {
    color: vars["--aui-color-text"],
  },
  blocked: {
    color: vars["--aui-color-warning-text"],
  },
  blockedDetail: {
    marginBlock: 0,
  },
  openSettingsLink: {
    textAlign: "start",
    fontSize: vars["--aui-font-size-caption"],
    textUnderlineOffset: 2,
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
  },
});
