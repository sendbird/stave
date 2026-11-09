import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Task/CLI preset create/edit form inside the Presets settings section. */
export const taskPresetEditorStyles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  label: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  option: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  optionIcon: {
    height: 14,
    width: 14,
  },
  optionLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
    paddingBlockStart: vars["--aui-space-4"],
  },
});
