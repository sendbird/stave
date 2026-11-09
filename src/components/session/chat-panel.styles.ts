import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";
import { transcriptMeasure } from "@/components/ai-elements/transcript-measure.stylex";

/**
 * The message shell publishes its hover / focus-within state as custom
 * properties so the trailing action clusters can reveal themselves. StyleX
 * conditions only see the element they sit on, so a `group-hover` /
 * `group-focus-within` reveal has to travel down through variables rather than
 * a descendant selector.
 */
const REVEAL_OPACITY = "--messageActionsOpacity";
const REVEAL_POINTER = "--messageActionsPointerEvents";
/** Copy, time details and rewind: three 28px actions with their gaps. */
const USER_ACTIONS_ROOM = "6.5rem";

export const chatPanelStyles = stylex.create({
  dateSeparator: {
    textAlign: "center",
    paddingBlock: vars["--aui-space-8"],
    marginBottom: vars["--aui-space-12"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  // A user row opens a turn: its top padding plus the list's in-turn gap is
  // the between-turn gap (8 + 20 = 28px against 8px inside a turn).
  rowTurnStart: {
    paddingTop: vars["--aui-space-20"],
  },
  // A user message sent right after another sits 2px under it: this row's
  // margin takes back all but 2px of the list's in-turn gap below it.
  rowGroupedWithNext: {
    marginBottom: `calc(${vars["--aui-space-2"]} - ${vars["--aui-space-8"]})`,
  },
  // Quiet metadata above the reply it introduces; the reply keeps the usual
  // in-turn gap below the bubble above.
  modelChange: {
    paddingBottom: vars["--aui-space-8"],
  },
  rowFirst: {
    paddingTop: {
      default: vars["--aui-space-12"],
      "@media (min-width: 40rem)": vars["--aui-space-16"],
    },
  },
  shell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    [REVEAL_OPACITY]: {
      default: 0,
      "@media (hover: none)": 1,
      ":hover": 1,
      ":focus-within": 1,
    },
    [REVEAL_POINTER]: {
      default: "none",
      "@media (hover: none)": "auto",
      ":hover": "auto",
      ":focus-within": "auto",
    },
  },
  shellDetailsOpen: {
    [REVEAL_OPACITY]: 1,
    [REVEAL_POINTER]: "auto",
  },
  // The row already sits in the shared transcript column, so the reply fills
  // it; a narrower, left-aligned cap here is what pulled replies off the axis
  // the composer and the user bubbles share.
  shellAssistant: {
    width: "100%",
    gap: "0.375rem",
  },
  // The bubble ends on the column's right edge. Its hover actions sit beside
  // it (see `actionsUser`), so the cap keeps room for them on the left.
  shellUser: {
    position: "relative",
    minWidth: 0,
    maxWidth: `min(88%, calc(100% - ${USER_ACTIONS_ROOM}))`,
    width: "fit-content",
    gap: vars["--aui-space-4"],
  },
  assistantContent: { paddingBottom: vars["--aui-space-4"] },
  steerLabel: {
    alignSelf: "flex-end",
    paddingInline: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  // Beside the bubble, bottom-aligned, rather than in a row under it: an
  // always-reserved row of invisible buttons made the space inside a turn
  // (prompt to reply) larger than the space between turns.
  actionsUser: {
    pointerEvents: `var(${REVEAL_POINTER})`,
    position: "absolute",
    right: "100%",
    bottom: 0,
    width: "max-content",
    paddingInlineEnd: vars["--aui-space-4"],
    opacity: `var(${REVEAL_OPACITY})`,
    transitionProperty: {
      default: "opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  actionsAssistant: {
    alignSelf: "stretch",
    marginLeft: 0,
    marginTop: vars["--aui-space-4"],
  },
  actionRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  // Hoverable so the tooltip can name the model and account; still not an
  // action, so it neither paints a hover fill nor moves on press.
  providerAction: {
    height: "auto",
    maxWidth: "100%",
    cursor: "default",
    gap: 0,
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: 0,
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
      ":active": "transparent",
    },
    padding: 0,
    fontWeight: vars["--aui-font-weight-regular"],
    opacity: 1,
  },
  elapsedAction: {
    pointerEvents: "none",
    height: 28,
    cursor: "default",
    gap: "0.375rem",
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-text-muted"],
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
    transitionDuration: vars["--aui-motion-duration-quick"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  dialogContent: { maxWidth: "28rem" },
  dialogBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  dialogStatusRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  dialogFilesLine: { fontSize: vars["--aui-font-size-body"], color: vars["--aui-color-text"] },
  dialogFileList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    maxHeight: "12rem",
    overflowY: "auto",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    padding: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  dialogFileItem: { overflowWrap: "anywhere", wordBreak: "break-all" },
  dialogEmpty: { fontSize: vars["--aui-font-size-body"], color: vars["--aui-color-text-muted"] },
  dialogError: { fontSize: vars["--aui-font-size-body"], color: vars["--aui-color-danger"] },
  loadOlderRow: {
    marginInline: "auto",
    marginBottom: vars["--aui-space-12"],
    display: "flex",
    width: "100%",
    maxWidth: {
      default: `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-12"]})`,
      "@media (min-width: 40rem)": `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-20"]})`,
    },
    paddingInline: {
      default: vars["--aui-space-12"],
      "@media (min-width: 40rem)": vars["--aui-space-20"],
    },
    paddingTop: {
      default: vars["--aui-space-12"],
      "@media (min-width: 40rem)": vars["--aui-space-16"],
    },
  },
  loadOlderButton: { height: 32, borderRadius: vars["--aui-radius-control"] },
  loadOlderFailed: {
    alignSelf: "center",
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginInlineEnd: vars["--aui-space-8"],
  },
  panelColumn: {
    display: "flex",
    height: "100%",
    width: "100%",
    flexDirection: "column",
  },
});
