import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const scriptsSectionStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  emptyState: {
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  emptyIcon: {
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
  },
  projectLabel: {
    display: "flex",
    maxInlineSize: "28rem",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  projectLabelText: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  triggerFull: {
    inlineSize: "100%",
  },
});
