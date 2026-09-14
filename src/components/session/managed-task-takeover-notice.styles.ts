import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const managedTaskTakeoverNoticeStyles = stylex.create({
  // Same 0.75rem inset as the docked turn-activity shelf. Framed mode with
  // side tracks overrides margin-inline from `globals.css` via the
  // `[data-managed-task-notice="true"]` hook, which is why the inset lives on
  // margin here rather than on the composer measure parent.
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    marginBottom: vars["--ads-space-8"],
    marginInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  iconBadge: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text"],
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
    gap: vars["--ads-space-8"],
  },
  ownerLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  managedBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  detail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
  },
  badgeIcon: {
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
});
