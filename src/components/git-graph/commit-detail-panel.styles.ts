import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The details aside sits on the Monaco editor surface (`--editor`); every other
 * color resolves to an ADS token. The changed-file rows publish their hover
 * state through a CSS variable so the per-row diff stats can reveal themselves
 * without a `group-hover` descendant selector (StyleX has no group variant).
 */
const FILE_ROW_STATS = "--gitGraphFileStatsDisplay";

export const commitDetailPanelStyles = stylex.create({
  aside: {
    display: "flex",
    height: "100%",
    minHeight: 0,
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "var(--editor)",
  },
  scroll: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    overflowY: "auto",
  },
  header: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  headerTop: {
    marginBottom: vars["--ads-space-8"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  headerTitleWrap: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text"],
  },
  hashButton: {
    marginTop: vars["--ads-space-4"],
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  hashIcon: {
    width: 10,
    height: 10,
  },
  closeButton: {
    width: 24,
    height: 24,
  },
  closeIcon: {
    width: 14,
    height: 14,
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  metaGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  metaRow: {
    display: "grid",
    gridTemplateColumns: "5.5rem minmax(0,1fr)",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-micro"],
  },
  metaLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: vars["--ads-color-text-muted"],
  },
  metaIcon: {
    width: 12,
    height: 12,
  },
  metaValue: {
    minWidth: 0,
    overflowWrap: "break-word",
    color: `color-mix(in oklch, ${vars["--ads-color-text"]} 85%, transparent)`,
  },
  metaMono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },
  signatureIdentity: {
    marginLeft: vars["--ads-space-4"],
    color: vars["--ads-color-text-muted"],
  },
  toneSuccess: {
    color: vars["--ads-color-success-text"],
  },
  toneWarning: {
    color: vars["--ads-color-warning-text"],
  },
  toneDanger: {
    color: vars["--ads-color-danger-text"],
  },
  toneMuted: {
    color: vars["--ads-color-text-muted"],
  },
  body: {
    marginTop: vars["--ads-space-12"],
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
    paddingTop: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: `color-mix(in oklch, ${vars["--ads-color-text"]} 80%, transparent)`,
  },
  // Four counts in one line, not four tiles: staged/changed/untracked are
  // bookkeeping and stay muted; only a conflict is a state that gets color.
  summaryRow: {
    columnGap: vars["--ads-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    rowGap: vars["--ads-space-4"],
  },
  summaryItem: {
    alignItems: "baseline",
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    gap: vars["--ads-space-4"],
  },
  summaryCount: {
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  summaryCountConflicts: {
    color: vars["--ads-color-danger-text"],
  },
  filesHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 45%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  filesHeaderLabel: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars["--ads-color-text-muted"],
  },
  filesCount: {
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  totals: {
    marginLeft: "auto",
    display: "flex",
    gap: vars["--ads-space-4"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  additions: {
    color: vars["--ads-color-diff-added-text"],
  },
  deletions: {
    color: vars["--ads-color-diff-removed-text"],
  },
  loaderMuted: {
    color: vars["--ads-color-text-muted"],
  },
  fileList: {
    minHeight: 0,
    flex: 1,
    padding: vars["--ads-space-8"],
  },
  fileListEntries: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  emptyCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBlock: vars["--ads-space-32"],
  },
  emptyText: {
    paddingInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  fileRow: {
    [FILE_ROW_STATS]: {
      default: "none",
      ":hover": "flex",
    },
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    paddingInline: 6,
    paddingBlock: 6,
    textAlign: "left",
    fontSize: vars["--ads-font-size-micro"],
  },
  fileStatus: {
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  fileIcon: {
    width: 12,
    height: 12,
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
  },
  filePath: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--ads-color-text"],
  },
  fileStats: {
    display: `var(${FILE_ROW_STATS}, none)`,
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
  // File-status chips — border/bg/text triplets keyed by git status.
  statusAdded: {
    borderColor: vars["--ads-color-diff-added-text"],
    backgroundColor: vars["--ads-color-diff-added"],
    color: vars["--ads-color-diff-added-text"],
  },
  statusRemoved: {
    borderColor: vars["--ads-color-diff-removed-text"],
    backgroundColor: vars["--ads-color-diff-removed"],
    color: vars["--ads-color-diff-removed-text"],
  },
  statusModified: {
    borderColor: `color-mix(in oklab, var(--service-git-modified) 40%, transparent)`,
    backgroundColor: `color-mix(in oklab, var(--service-git-modified) 10%, transparent)`,
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-modified))`,
  },
  statusRenamed: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-info-border"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-info"]} 10%, transparent)`,
    color: vars["--ads-color-info-text"],
  },
  statusDefault: {
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
  },
});
