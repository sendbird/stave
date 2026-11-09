import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The pending approval attached to the composer: one row that names the tool
 * and what it would run, the decision set, and a disclosure for the rest.
 *
 * The row is the only place the request is shown while the conversation is in
 * view, so it carries the attention tone (the warning border) and nothing else
 * does — no banner above the transcript, no second card.
 */
export const composerApprovalRowStyles = stylex.create({
  section: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    // Its own object above the card: a clear step of air, not a seam.
    marginBottom: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  // Wraps only when the decision set no longer fits beside the request: the
  // identity takes the first line and the decisions move under it whole.
  row: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    // A 32px decision button with an even 8px ring of air: a 48px row.
    minBlockSize: vars["--aui-control-height-md"],
    paddingBlock: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
  },
  identity: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 10rem",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  statusIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-warning-text"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  tool: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  // "· requested by Explore": who asked, first in the details, so the row
  // keeps its width for the command.
  requester: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  // The request's risk as a word in muted ink, not a badge: the row's
  // warning border is already its one attention signal. A short word that
  // stays whole; the command beside it is what truncates.
  risk: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  summary: {
    color: vars["--aui-color-text-muted"],
    flex: "1 1 auto",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stepper: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
  },
  position: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  trailing: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: vars["--aui-space-8"],
    marginInlineStart: "auto",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  allowKey: {
    marginInlineStart: vars["--aui-space-4"],
  },
  details: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    // Bounded so expanding a long input never takes the transcript back; the
    // details scroll inside instead.
    maxBlockSize: "10rem",
    overflowY: "auto",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  argument: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  argumentLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  argumentValue: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
    padding: vars["--aui-space-8"],
    whiteSpace: "pre-wrap",
  },
  guidanceField: {
    backgroundColor: vars["--aui-color-canvas"],
    fontSize: vars["--aui-font-size-caption"],
    minBlockSize: 0,
    resize: "none",
  },
  detailActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  footer: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    margin: 0,
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
});
