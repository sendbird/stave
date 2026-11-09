import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * The one inbox row, shared by Fleet's attention rail and the notification
 * bell: an entry reads, sits and is acted on the same way in both.
 */
export const inboxRowStyles = stylex.create({
  row: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: vars["--aui-border-width-hairline"],
      ":last-child": 0,
    },
  },
  /** One line at the 36px control step; wraps only when the band is too narrow. */
  rowCompact: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minHeight: vars["--aui-control-height-md"],
    paddingInlineEnd: vars["--aui-space-8"],
  },
  rowTriggerCompact: {
    alignItems: "center",
    alignSelf: "stretch",
    flexBasis: "16rem",
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    width: "auto",
  },
  compactMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  compactTitle: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 1,
    minWidth: "4rem",
  },
  compactWhere: {
    color: vars["--aui-color-text-muted"],
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1000,
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  compactSupplement: {
    flexShrink: 0,
    flexWrap: "nowrap",
  },
  compactTime: {
    fontVariantNumeric: "tabular-nums",
    marginInlineStart: 0,
  },
  rowActionsCompact: {
    flexShrink: 0,
    flexWrap: "nowrap",
    paddingBottom: 0,
    paddingInline: 0,
  },
  compactChildren: {
    flexBasis: "100%",
    minWidth: 0,
  },
  rowSelected: {
    backgroundColor: vars["--aui-color-selection-fill"],
  },
  /** An entry whose notification nobody has read yet. */
  unreadDot: {
    backgroundColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  /** A note under the summary: a quiet turn's time, an archived task. */
  rowSupplement: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  archivedChip: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-warning-text"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-micro"],
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: 6,
  },
  chipIcon: { height: 12, width: 12 },
  /** A confirmation inside the row (restore an archived task, for example). */
  rowPrompt: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    marginBlockEnd: vars["--aui-space-8"],
    marginInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  promptTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  promptBody: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  promptActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
    marginTop: vars["--aui-space-4"],
  },
  rowTrigger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars["--aui-z-index-panel"],
    },
  },
  rowTop: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  /** The badge states the need; it must never stretch to the row's width. */
  needBadge: {
    flexShrink: 0,
  },
  // Glyphs inside interactive rows take the control-icon floor.
  needIcon: {
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
  rowTime: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
  },
  /*
   * A blocking wait past `FLEET_WAIT_AGE_THRESHOLDS_MS`. The words take the
   * same ink as `StateMark`'s needs-answer and failed words: the state color
   * mixed with body text for 4.5:1, from the theme's own `--state-*` values,
   * so every built-in theme already defines them.
   */
  rowTimeWarning: {
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--state-needs-answer))`,
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowTimeDanger: {
    color: vars["--aui-color-danger-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowTitle: {
    color: vars["--aui-color-text"],
    display: "block",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  rowMetaPart: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDetail: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    paddingBottom: 6,
    paddingInline: vars["--aui-space-8"],
  },
  rowAction: {
    fontSize: vars["--aui-font-size-caption"],
    height: 24,
    paddingInline: 6,
  },
  rowActionIcon: {
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
  /** A failed row action: its own line, after every button. */
  rowError: {
    color: vars["--aui-color-danger-text"],
    flexBasis: "100%",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    order: 1,
    overflowWrap: "anywhere",
  },
  /** The same answers on the row's own line, before its actions. */
  inlineAnswerCompact: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    maxInlineSize: "100%",
    minWidth: 0,
  },
  inlineOptionsCompact: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  inlineOptionCompact: {
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    height: vars["--aui-control-height-xs"],
    maxWidth: "12rem",
    paddingInline: vars["--aui-space-8"],
  },
  inlineNoteCompact: {
    maxWidth: "20rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inlineNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  inlineNoteError: {
    color: vars["--aui-color-danger-text"],
  },
  // The open control panel: bounded, scrolling inside itself, so it never
  // pushes the rest of the inbox out of the band.
  rowControls: {
    backgroundColor: vars["--aui-color-canvas"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    maxBlockSize: "min(50vh, 30rem)",
    overflowY: "auto",
  },
});
