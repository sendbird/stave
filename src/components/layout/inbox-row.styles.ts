import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * The one inbox row, shared by Fleet's attention rail and the notification
 * bell: an entry reads, sits and is acted on the same way in both.
 */
export const inboxRowStyles = stylex.create({
  row: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: vars["--ads-border-width-hairline"],
      ":last-child": 0,
    },
  },
  rowSelected: {
    backgroundColor: vars["--ads-color-selection-fill"],
  },
  /** An entry whose notification nobody has read yet. */
  unreadDot: {
    backgroundColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  /** A note under the summary: a quiet turn's time, an archived task. */
  rowSupplement: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  archivedChip: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: 6,
  },
  chipIcon: { height: 12, width: 12 },
  /** A confirmation inside the row (restore an archived task, for example). */
  rowPrompt: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    marginBlockEnd: vars["--ads-space-8"],
    marginInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  promptTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
  },
  promptBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
  promptActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    marginTop: vars["--ads-space-4"],
  },
  rowTrigger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars["--ads-z-index-panel"],
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
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  rowTime: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    marginInlineStart: "auto",
  },
  rowTitle: {
    color: vars["--ads-color-text"],
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  rowMetaPart: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDetail: {
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
    paddingBottom: 6,
    paddingInline: vars["--ads-space-8"],
  },
  rowAction: {
    fontSize: vars["--ads-font-size-caption"],
    height: 24,
    paddingInline: 6,
  },
  rowActionIcon: {
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  /** A failed row action: its own line, after every button. */
  rowError: {
    color: vars["--ads-color-danger-text"],
    flexBasis: "100%",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    order: 1,
    overflowWrap: "anywhere",
  },
  /** A request answered in the row, under the row's own summary. */
  inlineAnswer: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    // A decision reads at a measure, not across a wide band.
    maxInlineSize: "44rem",
    minWidth: 0,
    paddingBottom: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-12"],
  },
  inlineKeyHint: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-micro"],
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  inlineQuestion: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  inlineQuestionText: {
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  inlineOptions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  inlineOption: {
    gap: vars["--ads-space-4"],
    maxWidth: "100%",
  },
  inlineNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  inlineNoteError: {
    color: vars["--ads-color-danger-text"],
  },
  // The open control panel: bounded, scrolling inside itself, so it never
  // pushes the rest of the inbox out of the band.
  rowControls: {
    backgroundColor: vars["--ads-color-canvas"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    maxBlockSize: "min(50vh, 30rem)",
    overflowY: "auto",
  },
});
