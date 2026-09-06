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
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 65%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  headerTop: {
    marginBottom: vars.space8,
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
  },
  headerTitleWrap: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    color: vars.colorText,
  },
  hashButton: {
    marginTop: vars.space4,
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space4,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
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
    gap: vars.space8,
    paddingBlock: vars.space12,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
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
    gap: vars.space8,
    fontSize: vars.fontSizeMicro,
  },
  metaLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: vars.colorTextMuted,
  },
  metaIcon: {
    width: 12,
    height: 12,
  },
  metaValue: {
    minWidth: 0,
    overflowWrap: "break-word",
    color: `color-mix(in oklch, ${vars.colorText} 85%, transparent)`,
  },
  metaMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },
  signatureIdentity: {
    marginLeft: vars.space4,
    color: vars.colorTextMuted,
  },
  toneSuccess: {
    color: vars.colorSuccessText,
  },
  toneWarning: {
    color: vars.colorWarningText,
  },
  toneInfo: {
    color: vars.colorInfoText,
  },
  toneDanger: {
    color: vars.colorDangerText,
  },
  toneMuted: {
    color: vars.colorTextMuted,
  },
  body: {
    marginTop: vars.space12,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars.colorBorder} 50%, transparent)`,
    paddingTop: vars.space12,
    fontSize: vars.fontSizeCaption,
    lineHeight: "20px",
    color: `color-mix(in oklch, ${vars.colorText} 80%, transparent)`,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6,
  },
  summaryCell: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 55%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 20%, transparent)`,
    paddingInline: vars.space8,
    paddingBlock: 6,
  },
  summaryCount: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    fontVariantNumeric: "tabular-nums",
  },
  summaryLabel: {
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  filesHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 45%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  filesHeaderLabel: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars.colorTextMuted,
  },
  filesCount: {
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    color: vars.colorTextMuted,
  },
  totals: {
    marginLeft: "auto",
    display: "flex",
    gap: vars.space4,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
  },
  additions: {
    color: vars.colorSuccessText,
  },
  deletions: {
    color: vars.colorDangerText,
  },
  loaderMuted: {
    color: vars.colorTextMuted,
  },
  fileList: {
    minHeight: 0,
    flex: 1,
    padding: vars.space8,
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
    paddingBlock: vars.space32,
  },
  emptyText: {
    paddingInline: vars.space4,
    paddingBlock: vars.space12,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  fileRow: {
    [FILE_ROW_STATS]: {
      default: "none",
      ":hover": "flex",
    },
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    paddingInline: 6,
    paddingBlock: 6,
    textAlign: "left",
    fontSize: vars.fontSizeMicro,
  },
  fileStatus: {
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    fontFamily: vars.fontMono,
    fontSize: 9,
    fontWeight: vars.fontWeightSemibold,
  },
  fileIcon: {
    width: 12,
    height: 12,
    flexShrink: 0,
    color: vars.colorTextMuted,
  },
  filePath: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars.colorText,
  },
  fileStats: {
    display: `var(${FILE_ROW_STATS}, none)`,
    flexShrink: 0,
    gap: vars.space4,
    fontFamily: vars.fontMono,
    fontSize: 9,
    fontVariantNumeric: "tabular-nums",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
  // File-status chips — border/bg/text triplets keyed by git status.
  statusAdded: {
    borderColor: `color-mix(in oklch, ${vars.colorSuccessBorder} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorSuccess} 10%, transparent)`,
    color: vars.colorSuccessText,
  },
  statusRemoved: {
    borderColor: `color-mix(in oklch, ${vars.colorDangerBorder} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorDanger} 10%, transparent)`,
    color: vars.colorDangerText,
  },
  statusModified: {
    borderColor: `color-mix(in oklch, ${vars.colorWarningBorder} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorWarning} 10%, transparent)`,
    color: vars.colorWarningText,
  },
  statusRenamed: {
    borderColor: `color-mix(in oklch, ${vars.colorInfoBorder} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorInfo} 10%, transparent)`,
    color: vars.colorInfoText,
  },
  statusDefault: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
  },
});
