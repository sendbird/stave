import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providerErrorRecoveryStyles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
  },
  messageRow: {
    alignItems: "flex-start",
    color: vars["--ads-color-danger-text"],
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  messageIcon: {
    flexShrink: 0,
    height: vars["--ads-control-icon-size-sm"],
    marginTop: vars["--ads-space-2"],
    width: vars["--ads-control-icon-size-sm"],
  },
  message: {
    fontWeight: vars["--ads-font-weight-medium"],
  },
  guidance: {
    color: vars["--ads-color-text-muted"],
  },
  resume: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  help: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
  },
  error: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
