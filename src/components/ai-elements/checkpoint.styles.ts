import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const checkpointStyles = stylex.create({
  compacting: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-2"],
    fontSize: `max(0.75em, ${vars["--aui-font-size-caption"]})`,
    color: vars["--aui-color-text-muted"],
  },
  compactingLoader: { flexShrink: 0 },

  divider: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    fontSize: `max(0.75em, ${vars["--aui-font-size-caption"]})`,
    color: vars["--aui-color-text-muted"],
    userSelect: "none",
  },
  line: {
    height: 1,
    flex: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
  },
  chip: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 50%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: vars["--aui-space-2"],
  },
  chipLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    paddingInline: vars["--aui-space-4"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  chipIcon: { width: 12, height: 12, flexShrink: 0 },
  confirmRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },

  action: {
    height: vars["--aui-space-24"],
    paddingInline: "0.375rem",
    fontSize: `max(0.6875em, ${vars["--aui-font-size-caption"]})`,
  },
  actionDanger: {
    color: {
      default: vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  actionIcon: { marginRight: vars["--aui-space-4"], width: 12, height: 12 },
  actionLoader: { marginRight: vars["--aui-space-4"] },
});
