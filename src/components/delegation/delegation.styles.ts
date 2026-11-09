import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * One stylesheet for every delegation primitive. Two type scales only —
 * Caption for anything a person reads, Micro for labels and metadata — and a
 * single `label` treatment, so an exchange never mixes four scales the way the
 * floating advisor card used to.
 */
export const delegationStyles = stylex.create({
  diagnosticToggle: {
    cursor: "pointer",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-8"],
    ':focus-visible': { outline: `2px solid ${vars["--aui-color-border-focus"]}`, outlineOffset: 2 },
  },
  /* ── AgentIdentity ─────────────────────────────────────────────────── */
  identity: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  // The identity is the row's "who"; it keeps its width and the title
  // truncates first when the two compete for one line.
  identityCompact: {
    flexShrink: 0,
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  identityRole: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  identityModel: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityModelMuted: {
    color: vars["--aui-color-text-muted"],
    fontWeight: vars["--aui-font-weight-regular"],
  },
  // How the model was learned (`requested`, `reported`, …) qualifies the name,
  // so it sits a step below it. Without its own size it inherited the row
  // button's and printed larger than the model it annotates.
  identityEvidence: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    whiteSpace: "nowrap",
  },
  // The routed model beside the requested one: quieter than the identity it
  // qualifies, and the first thing to truncate on a narrow row.
  identityRouted: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityChip: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    minBlockSize: "1rem",
    paddingInline: vars["--aui-space-4"],
  },

  /* ── Labels & prose (the two scales) ───────────────────────────────── */
  label: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.08em",
    margin: 0,
    textTransform: "uppercase",
  },
  prose: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "break-word",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    whiteSpace: "pre-wrap",
  },
  proseMuted: {
    color: vars["--aui-color-text-muted"],
  },
  proseDanger: {
    borderColor: vars["--aui-color-danger-border"],
    color: vars["--aui-color-danger-text"],
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: 1.45,
    margin: 0,
  },

  /* ── KeyValueGrid ──────────────────────────────────────────────────── */
  grid: {
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))",
    margin: 0,
    rowGap: vars["--aui-space-8"],
  },
  gridCell: {
    minWidth: 0,
  },
  gridValue: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "break-word",
  },
  gridValueNowrap: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* ── StageTimeline ─────────────────────────────────────────────────── */
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  timelineItem: {
    alignItems: "baseline",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    lineHeight: 1.5,
  },
  timelineAt: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    minWidth: "3.25rem",
  },
  timelineLabel: {
    color: vars["--aui-color-text"],
    flex: 1,
    minWidth: 0,
    overflowWrap: "break-word",
  },
  timelineDetail: {
    color: vars["--aui-color-text-muted"],
  },

  /* ── ExchangeRow ───────────────────────────────────────────────────── */
  // A row carries a control height, so it takes the control corner (AUI §7);
  // the panel corner is for containers.
  row: {
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rowExpanded: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 40%, transparent)`,
  },
  rowHeader: {
    alignItems: "flex-start",
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text"],
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    textAlign: "left",
    width: "100%",
  },
  rowStatusSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
  },
  rowBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  // Title and identity share a line while it fits; in a narrow shelf the
  // identity wraps under the title rather than either one being cut short.
  rowTitleLine: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    rowGap: 0,
  },
  rowTitle: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowTitleExpanded: {
    display: "-webkit-box",
    flexShrink: 1,
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "normal",
  },
  rowTitleDone: {
    color: vars["--aui-color-text-muted"],
  },
  rowAsk: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowAskExpanded: {
    display: "-webkit-box",
    lineHeight: vars["--aui-line-height-normal"],
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    whiteSpace: "normal",
  },
  rowAside: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
    paddingTop: "0.125rem",
  },
  rowElapsed: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
  },
  rowDeadline: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    whiteSpace: "nowrap",
  },
  rowDeadlinePassed: {
    color: vars["--aui-color-warning-text"],
  },
  rowChevron: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 14,
    marginTop: 3,
    width: 14,
  },
  rowDetailHost: {
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },

  /* ── ExchangeDetail ────────────────────────────────────────────────── */
  detail: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    minWidth: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  sectionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
  },
  actionsEnd: {
    marginInlineStart: "auto",
  },

  /* ── Delegations block header (shared by shelf and panel) ─────────── */
  blockHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  blockTitle: {
    color: vars["--aui-color-text"],
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  blockCounts: {
    color: vars["--aui-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-regular"],
  },
  blockElapsed: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  blockList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
});
