import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const managedTaskTakeoverNoticeStyles = stylex.create({
  // Same 0.75rem inset as the docked turn-activity shelf. Framed mode with
  // side tracks overrides margin-inline from `globals.css` via the
  // `[data-managed-task-notice="true"]` hook, which is why the inset lives on
  // margin here rather than on the composer measure parent.
  root: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    marginBottom: vars.space8,
    marginInline: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  iconBadge: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorText,
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
    gap: vars.space8,
  },
  ownerLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  managedBadge: {
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  detail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space2,
  },
  badgeIcon: {
    height: vars.controlIconSizeSm,
    width: vars.controlIconSizeSm,
  },
});
