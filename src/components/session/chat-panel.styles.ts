import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The message shell publishes its hover / focus-within state as custom
 * properties so the trailing action clusters can reveal themselves. StyleX
 * conditions only see the element they sit on, so a `group-hover` /
 * `group-focus-within` reveal has to travel down through variables rather than
 * a descendant selector.
 */
const REVEAL_OPACITY = "--messageActionsOpacity";
const REVEAL_POINTER = "--messageActionsPointerEvents";

export const chatPanelStyles = stylex.create({
  rowFirst: {
    paddingTop: {
      default: vars.space12,
      "@media (min-width: 40rem)": vars.space16,
    },
  },
  shell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    [REVEAL_OPACITY]: {
      default: 0,
      ":hover": 1,
      ":focus-within": 1,
    },
    [REVEAL_POINTER]: {
      default: "none",
      ":hover": "auto",
      ":focus-within": "auto",
    },
  },
  shellAssistant: {
    width: "100%",
    maxWidth: "56rem",
    gap: "0.375rem",
  },
  shellUser: {
    minWidth: 0,
    maxWidth: "88%",
    width: "fit-content",
    gap: vars.space4,
  },
  assistantContent: { paddingBottom: vars.space4 },
  steerLabel: {
    alignSelf: "flex-end",
    paddingInline: vars.space4,
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  actionsUser: {
    pointerEvents: `var(${REVEAL_POINTER})`,
    alignSelf: "flex-end",
    marginLeft: 0,
    marginTop: vars.space4,
    opacity: `var(${REVEAL_OPACITY})`,
    transitionProperty: {
      default: "opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  actionsAssistant: {
    alignSelf: "stretch",
    marginLeft: 0,
    marginTop: vars.space4,
  },
  actionRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
  },
  providerAction: {
    pointerEvents: "none",
    height: "auto",
    maxWidth: "100%",
    cursor: "default",
    gap: 0,
    borderRadius: vars.radiusMark,
    borderWidth: 0,
    backgroundColor: { default: "transparent", ":hover": "transparent" },
    padding: 0,
    fontWeight: vars.fontWeightRegular,
    opacity: 1,
  },
  elapsedAction: {
    pointerEvents: "none",
    height: 28,
    cursor: "default",
    gap: "0.375rem",
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightRegular,
    color: vars.colorTextMuted,
    opacity: 1,
  },
  rewindIcon: { width: 14, height: 14 },
  turnActionsReveal: {
    pointerEvents: `var(${REVEAL_POINTER})`,
    opacity: `var(${REVEAL_OPACITY})`,
    transitionProperty: {
      default: "opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: vars.motionDurationQuick,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  dialogContent: { maxWidth: "28rem" },
  dialogBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  dialogStatusRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  dialogFilesLine: { fontSize: vars.fontSizeBody, color: vars.colorText },
  dialogFileList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    maxHeight: "12rem",
    overflowY: "auto",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    padding: vars.space12,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  dialogFileItem: { overflowWrap: "anywhere", wordBreak: "break-all" },
  dialogEmpty: { fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
  dialogError: { fontSize: vars.fontSizeBody, color: vars.colorDanger },
  loadOlderRow: {
    marginInline: "auto",
    marginBottom: vars.space12,
    display: "flex",
    width: "100%",
    maxWidth: "72rem",
    paddingInline: {
      default: vars.space12,
      "@media (min-width: 40rem)": vars.space20,
    },
    paddingTop: {
      default: vars.space12,
      "@media (min-width: 40rem)": vars.space16,
    },
  },
  loadOlderButton: { height: 32, borderRadius: vars.radiusMark },
  panelColumn: {
    display: "flex",
    height: "100%",
    width: "100%",
    flexDirection: "column",
  },
});
