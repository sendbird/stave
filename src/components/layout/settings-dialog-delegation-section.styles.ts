import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Delegated tasks card: one status line per provider, then the fix when blocked. */
export const delegationStyles = stylex.create({
  status: {
    color: vars["--ads-color-text-muted"],
    display: "grid",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  list: {
    display: "grid",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    marginBlock: 0,
    paddingInlineStart: 0,
  },
  emphasis: {
    color: vars["--ads-color-text"],
  },
  blocked: {
    color: vars["--ads-color-warning-text"],
  },
  blockedDetail: {
    marginBlock: 0,
  },
  openSettingsLink: {
    textAlign: "start",
    fontSize: vars["--ads-font-size-caption"],
    textUnderlineOffset: 2,
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
});
