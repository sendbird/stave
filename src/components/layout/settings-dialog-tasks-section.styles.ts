import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Tasks (tracker) settings card layout. */
export const tasksSectionStyles = stylex.create({
  card: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  cardHeader: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-20"],
  },
  cardTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-20"],
  },
  hint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  hintSpaced: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-4"],
  },
  field: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  fieldLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  triggerWide: {
    inlineSize: "16rem",
  },
  intervalInput: {
    inlineSize: "10rem",
  },
  sourcesCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
  },
  sourcesTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sourceList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  sourceRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  sourceMain: {
    minInlineSize: 0,
  },
  sourceHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  sourceLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sourceBadge: {
    fontSize: vars["--ads-font-size-caption"],
  },
  hintTight: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-2"],
  },
  sourceActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
  },
  setUpButton: {
    blockSize: vars["--ads-control-height-sm"],
  },
  openIntegrations: {
    fontSize: vars["--ads-font-size-caption"],
    blockSize: "auto",
    paddingInline: 0,
  },
});
