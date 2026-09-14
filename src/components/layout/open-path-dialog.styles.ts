import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const openPathDialogStyles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: vars["--ads-space-16"],
    backgroundColor: vars["--ads-color-overlay"],
  },
  panel: {
    width: "100%",
    maxWidth: "28rem",
    padding: vars["--ads-space-16"],
  },
  title: {
    margin: 0,
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  description: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  pathRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-12"],
  },
  pathInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
  },
  browseButton: {
    flexShrink: 0,
    gap: 6,
  },
  browseIcon: {
    width: 16,
    height: 16,
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-danger-text"],
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-16"],
  },
});
