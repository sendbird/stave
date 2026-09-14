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
      default: vars["--ads-space-12"],
      "@media (min-width: 40rem)": vars["--ads-space-16"],
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
    gap: vars["--ads-space-4"],
  },
  assistantContent: { paddingBottom: vars["--ads-space-4"] },
  steerLabel: {
    alignSelf: "flex-end",
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  actionsUser: {
    pointerEvents: `var(${REVEAL_POINTER})`,
    alignSelf: "flex-end",
    marginLeft: 0,
    marginTop: vars["--ads-space-4"],
    opacity: `var(${REVEAL_OPACITY})`,
    transitionProperty: {
      default: "opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  actionsAssistant: {
    alignSelf: "stretch",
    marginLeft: 0,
    marginTop: vars["--ads-space-4"],
  },
  actionRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  providerAction: {
    pointerEvents: "none",
    height: "auto",
    maxWidth: "100%",
    cursor: "default",
    gap: 0,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: 0,
    backgroundColor: { default: "transparent", ":hover": "transparent" },
    padding: 0,
    fontWeight: vars["--ads-font-weight-regular"],
    opacity: 1,
  },
  elapsedAction: {
    pointerEvents: "none",
    height: 28,
    cursor: "default",
    gap: "0.375rem",
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
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
    transitionDuration: vars["--ads-motion-duration-quick"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  dialogContent: { maxWidth: "28rem" },
  dialogBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  dialogStatusRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  dialogFilesLine: { fontSize: vars["--ads-font-size-body"], color: vars["--ads-color-text"] },
  dialogFileList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    maxHeight: "12rem",
    overflowY: "auto",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    padding: vars["--ads-space-12"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  dialogFileItem: { overflowWrap: "anywhere", wordBreak: "break-all" },
  dialogEmpty: { fontSize: vars["--ads-font-size-body"], color: vars["--ads-color-text-muted"] },
  dialogError: { fontSize: vars["--ads-font-size-body"], color: vars["--ads-color-danger"] },
  loadOlderRow: {
    marginInline: "auto",
    marginBottom: vars["--ads-space-12"],
    display: "flex",
    width: "100%",
    maxWidth: "72rem",
    paddingInline: {
      default: vars["--ads-space-12"],
      "@media (min-width: 40rem)": vars["--ads-space-20"],
    },
    paddingTop: {
      default: vars["--ads-space-12"],
      "@media (min-width: 40rem)": vars["--ads-space-16"],
    },
  },
  loadOlderButton: { height: 32, borderRadius: vars["--ads-radius-mark"] },
  panelColumn: {
    display: "flex",
    height: "100%",
    width: "100%",
    flexDirection: "column",
  },
});
