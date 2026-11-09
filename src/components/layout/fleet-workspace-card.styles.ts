import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/** The status word next to a task's glyph only fits once the board is wide. */
const WIDE = "@media (min-width: 40rem)";

export const cardStyles = stylex.create({
  card: {
    backgroundColor: {
      default: vars["--aui-color-surface"],
      ":hover": vars["--aui-color-surface-raised"],
    },
    borderColor: {
      default: vars["--aui-color-border-subtle"],
      ":hover": vars["--aui-color-border"],
    },
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
  },
  // Activity is already stated three times inside the card (the per-task
  // status glyph and word, the footer timestamp, and this dim); a colored
  // cap on the card edge would be a fourth.
  cardDormant: {
    opacity: {
      default: 1,
      ":hover": 1,
    },
  },
  cardExpanded: {
    boxShadow: `0 0 0 1px ${vars["--aui-color-border-focus"]}`,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBottom: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    paddingTop: 10,
  },
  headerMain: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  name: {
    color: vars["--aui-color-text"],
    // Was a bare `13`, between Caption (12) and Body (14). Row titles are Body
    // medium across the fleet surfaces.
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Badges state a fact about the card; they never take the row's width. */
  chip: {
    flexShrink: 0,
    minWidth: 0,
  },
  dormantMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  dormantIcon: {
    color: vars["--aui-color-text-muted"],
    height: 12,
    width: 12,
  },
  metaRow: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    marginTop: vars["--aui-space-2"],
    minWidth: 0,
  },
  metaPart: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaIcon: {
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  tasks: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    minWidth: 0,
  },
  tasksEmpty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  searchNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlockStart: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-16"],
  },
  // The search-hit tint the Explorer and Git graph use.
  list: {
    minWidth: 0,
  },
  listItem: {
    minWidth: 0,
  },
  taskRow: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    display: "flex",
    gap: vars["--aui-space-8"],
    minHeight: 36,
    minWidth: 0,
    paddingBlock: 6,
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: vars["--aui-space-16"],
    position: "relative",
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars["--aui-z-index-panel"],
    },
  },
  taskRowExpanded: {
    backgroundColor: vars["--aui-color-selection-fill"],
  },
  providerMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  providerIcon: {
    height: 12,
    width: 12,
  },
  taskDetails: {
    display: "flex",
    flexDirection: "column",
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
    gap: vars["--aui-space-4"],
  },
  // The row title takes the body step; its timestamp uses the caption step.
  taskTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  taskStatus: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-4"],
  },
  statusLabel: {
    display: {
      default: "none",
      [WIDE]: "inline",
    },
  },
  disclosure: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "left",
    width: "100%",
  },
  controls: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
  },
  footer: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    marginTop: "auto",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--aui-space-12"],
  },
  todo: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  todoTrack: {
    backgroundColor: vars["--aui-color-track"],
    borderRadius: vars["--aui-radius-full"],
    height: 4,
    overflow: "hidden",
    width: 40,
  },
  todoFill: {
    backgroundColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-full"],
    display: "block",
    height: "100%",
  },
  todoCount: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  activity: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openAction: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    height: 24,
    marginInlineStart: "auto",
    paddingInline: vars["--aui-space-8"],
  },
  openIcon: {
    height: 12,
    width: 12,
  },
});
