import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const providerErrorRecoveryStyles = stylex.create({
  root: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
  },
  messageRow: {
    alignItems: "flex-start",
    color: vars["--aui-color-danger-text"],
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  messageIcon: {
    flexShrink: 0,
    height: vars["--aui-control-icon-size-sm"],
    marginTop: vars["--aui-space-2"],
    width: vars["--aui-control-icon-size-sm"],
  },
  message: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  guidance: {
    color: vars["--aui-color-text-muted"],
  },
  /** The account fix under a sign-in or usage-limit failure. */
  accountAction: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  resume: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  help: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
  },
});
