import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

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
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    // Its own object above the card: a clear step of air, not a seam.
    marginBottom: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  // Wraps only when the decision set no longer fits beside the request: the
  // identity takes the first line and the decisions move under it whole.
  row: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    // A 32px decision button with an even 8px ring of air: a 48px row.
    minBlockSize: vars["--ads-control-height-md"],
    paddingBlock: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-8"],
    paddingInlineStart: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
  },
  identity: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 10rem",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  statusIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-warning-text"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  tool: {
    color: vars["--ads-color-text"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    whiteSpace: "nowrap",
  },
  summary: {
    color: vars["--ads-color-text-muted"],
    flex: "1 1 auto",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stepper: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-2"],
  },
  position: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  trailing: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: vars["--ads-space-8"],
    marginInlineStart: "auto",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  allowKey: {
    marginInlineStart: vars["--ads-space-4"],
  },
  details: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    // Bounded so expanding a long input never takes the transcript back; the
    // details scroll inside instead.
    maxBlockSize: "10rem",
    overflowY: "auto",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  argument: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  argumentLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
  argumentValue: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
    padding: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },
  guidanceField: {
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: 0,
    resize: "none",
  },
  detailActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  footer: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    margin: 0,
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
});
