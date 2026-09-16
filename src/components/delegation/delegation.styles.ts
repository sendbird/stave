import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * One stylesheet for every delegation primitive. Two type scales only —
 * Caption for anything a person reads, Micro for labels and metadata — and a
 * single `label` treatment, so an exchange never mixes four scales the way the
 * floating advisor card used to.
 */
export const delegationStyles = stylex.create({
  /* ── AgentIdentity ─────────────────────────────────────────────────── */
  identity: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  // The identity is the row's "who"; it keeps its width and the title
  // truncates first when the two compete for one line.
  identityCompact: {
    flexShrink: 0,
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  identityIcon: {
    display: "block",
    flexShrink: 0,
    height: 14,
    objectFit: "contain",
    width: 14,
  },
  identityIconFallback: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  identityRole: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  identityModel: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityModelMuted: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
  },
  identityChip: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    minBlockSize: "1rem",
    paddingInline: vars["--ads-space-4"],
  },

  /* ── Labels & prose (the two scales) ───────────────────────────────── */
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.08em",
    margin: 0,
    textTransform: "uppercase",
  },
  prose: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },
  proseMuted: {
    color: vars["--ads-color-text-muted"],
  },
  proseDanger: {
    borderColor: vars["--ads-color-danger-border"],
    color: vars["--ads-color-danger-text"],
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.45,
    margin: 0,
  },

  /* ── KeyValueGrid ──────────────────────────────────────────────────── */
  grid: {
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))",
    margin: 0,
    rowGap: 6,
  },
  gridCell: {
    minWidth: 0,
  },
  gridValue: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
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
    gap: vars["--ads-space-2"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  timelineItem: {
    alignItems: "baseline",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    lineHeight: 1.5,
  },
  timelineAt: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    minWidth: "3.25rem",
  },
  timelineLabel: {
    color: vars["--ads-color-text"],
    flex: 1,
    minWidth: 0,
    overflowWrap: "break-word",
  },
  timelineDetail: {
    color: vars["--ads-color-text-muted"],
  },

  /* ── CheckList ─────────────────────────────────────────────────────── */
  checkList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  checkItem: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  checkBody: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: 1.45,
    margin: 0,
  },
  checkLabelFail: {
    color: vars["--ads-color-danger-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  checkDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.45,
    margin: 0,
    overflowWrap: "break-word",
  },

  /* ── ExchangeRow ───────────────────────────────────────────────────── */
  row: {
    borderRadius: vars["--ads-radius-panel"],
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rowExpanded: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 40%, transparent)`,
  },
  rowHeader: {
    alignItems: "flex-start",
    borderRadius: vars["--ads-radius-panel"],
    color: vars["--ads-color-text"],
    display: "flex",
    gap: "0.625rem",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
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
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  // Title and identity share a line while it fits; in a narrow shelf the
  // identity wraps under the title rather than either one being cut short.
  rowTitleLine: {
    alignItems: "center",
    columnGap: 6,
    display: "flex",
    flexWrap: "wrap",
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    rowGap: 0,
  },
  rowTitle: {
    color: vars["--ads-color-text"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
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
    color: vars["--ads-color-text-muted"],
  },
  rowAsk: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowAskExpanded: {
    display: "-webkit-box",
    lineHeight: vars["--ads-line-height-normal"],
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
    gap: vars["--ads-space-2"],
    paddingTop: "0.125rem",
  },
  rowElapsed: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
  },
  rowDeadline: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    whiteSpace: "nowrap",
  },
  rowDeadlinePassed: {
    color: vars["--ads-color-warning-text"],
  },
  rowChevron: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 14,
    marginTop: 3,
    width: 14,
  },
  rowDetailHost: {
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  /* Tree indentation for rows nested under a primary. */
  rowNested: {
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    borderLeftStyle: "solid",
    borderLeftWidth: vars["--ads-border-width-hairline"],
    marginInlineStart: vars["--ads-space-8"],
    paddingInlineStart: vars["--ads-space-4"],
  },

  /* ── ExchangeDetail ────────────────────────────────────────────────── */
  detail: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    minWidth: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  sectionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  actionsEnd: {
    marginInlineStart: "auto",
  },

  /* ── Delegations block header (shared by shelf and panel) ─────────── */
  blockHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  blockTitle: {
    color: vars["--ads-color-text"],
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  blockCounts: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
  },
  blockElapsed: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  blockList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
});

/**
 * Provider ink for the model name. The themed provider CSS variables carry the
 * brand colors; a non-provider presentation falls back to the ADS accent token.
 */
export const delegationWaveTone = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  cursor: { color: "var(--provider-cursor)" },
  kiro: { color: "var(--provider-kiro)" },
  accent: { color: vars["--ads-color-accent"] },
});
