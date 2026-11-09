import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const managedTaskTakeoverNoticeStyles = stylex.create({
  // Same 0.75rem inset as the docked turn-activity shelf. Framed mode with
  // side tracks overrides margin-inline from `globals.css` via the
  // `[data-managed-task-notice="true"]` hook, which is why the inset lives on
  // margin here rather than on the composer measure parent.
  root: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    marginBottom: vars["--aui-space-8"],
    marginInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  iconBadge: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  body: {
    flex: 1,
    minWidth: 192,
  },
  headerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  ownerLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  managedBadge: {
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  detail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
  },
  badgeIcon: {
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
});
