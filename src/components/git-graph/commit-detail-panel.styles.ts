import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The details aside sits on the Monaco editor surface (`--editor`); every other
 * color resolves to an AUI token. The changed-file rows publish their hover
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
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 65%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
  },
  headerTop: {
    marginBottom: vars["--aui-space-8"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  headerTitleWrap: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text"],
  },
  hashButton: {
    marginTop: vars["--aui-space-4"],
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
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
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
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
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
  },
  metaLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: vars["--aui-color-text-muted"],
  },
  metaIcon: {
    width: 12,
    height: 12,
  },
  metaValue: {
    minWidth: 0,
    overflowWrap: "break-word",
    color: `color-mix(in oklch, ${vars["--aui-color-text"]} 85%, transparent)`,
  },
  metaMono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  signatureIdentity: {
    marginLeft: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
  },
  toneSuccess: {
    color: vars["--aui-color-success-text"],
  },
  toneWarning: {
    color: vars["--aui-color-warning-text"],
  },
  toneDanger: {
    color: vars["--aui-color-danger-text"],
  },
  toneMuted: {
    color: vars["--aui-color-text-muted"],
  },
  body: {
    marginTop: vars["--aui-space-12"],
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 50%, transparent)`,
    paddingTop: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: `color-mix(in oklch, ${vars["--aui-color-text"]} 80%, transparent)`,
  },
  // Four counts in one line, not four tiles: staged/changed/untracked are
  // bookkeeping and stay muted; only a conflict is a state that gets color.
  summaryRow: {
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    rowGap: vars["--aui-space-4"],
  },
  summaryItem: {
    alignItems: "baseline",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    gap: vars["--aui-space-4"],
  },
  summaryCount: {
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  summaryCountConflicts: {
    color: vars["--aui-color-danger-text"],
  },
  filesHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 45%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  filesHeaderLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: vars["--aui-color-text-muted"],
  },
  filesCount: {
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  totals: {
    marginLeft: "auto",
    display: "flex",
    gap: vars["--aui-space-4"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  additions: {
    color: vars["--aui-color-diff-added-text"],
  },
  deletions: {
    color: vars["--aui-color-diff-removed-text"],
  },
  loaderMuted: {
    color: vars["--aui-color-text-muted"],
  },
  fileList: {
    minHeight: 0,
    flex: 1,
    padding: vars["--aui-space-8"],
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
    paddingBlock: vars["--aui-space-32"],
  },
  emptyText: {
    paddingInline: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  fileRow: {
    [FILE_ROW_STATS]: {
      default: "none",
      ":hover": "flex",
    },
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    paddingInline: 6,
    paddingBlock: 6,
    textAlign: "left",
    fontSize: vars["--aui-font-size-caption"],
  },
  fileStatus: {
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  fileIcon: {
    width: 12,
    height: 12,
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  filePath: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--aui-color-text"],
  },
  fileStats: {
    display: `var(${FILE_ROW_STATS}, none)`,
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
  // File-status chips — border/bg/text triplets keyed by git status.
  statusAdded: {
    borderColor: vars["--aui-color-diff-added-text"],
    backgroundColor: vars["--aui-color-diff-added"],
    color: vars["--aui-color-diff-added-text"],
  },
  statusRemoved: {
    borderColor: vars["--aui-color-diff-removed-text"],
    backgroundColor: vars["--aui-color-diff-removed"],
    color: vars["--aui-color-diff-removed-text"],
  },
  statusModified: {
    borderColor: `color-mix(in oklab, var(--service-git-modified) 40%, transparent)`,
    backgroundColor: `color-mix(in oklab, var(--service-git-modified) 10%, transparent)`,
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--service-git-modified))`,
  },
  statusRenamed: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-info-border"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-info"]} 10%, transparent)`,
    color: vars["--aui-color-info-text"],
  },
  statusDefault: {
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    color: vars["--aui-color-text-muted"],
  },
});
