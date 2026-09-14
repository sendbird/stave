import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const checkpointStyles = stylex.create({
  compacting: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-2"],
    fontSize: "0.75em",
    color: vars["--ads-color-text-muted"],
  },
  compactingLoader: { flexShrink: 0 },

  divider: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: "0.75em",
    color: vars["--ads-color-text-muted"],
    userSelect: "none",
  },
  line: {
    height: 1,
    flex: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
  },
  chip: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 50%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: vars["--ads-space-2"],
  },
  chipLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    paddingInline: vars["--ads-space-4"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  chipIcon: { width: 12, height: 12, flexShrink: 0 },
  confirmRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },

  action: {
    height: 20,
    paddingInline: "0.375rem",
    fontSize: "0.6875em",
  },
  actionDanger: {
    color: {
      default: vars["--ads-color-danger-text"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
  actionIcon: { marginRight: vars["--ads-space-4"], width: 12, height: 12 },
  actionLoader: { marginRight: vars["--ads-space-4"] },
});
