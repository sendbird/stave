import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Martin project card inside the Information panel.
 *
 * The open-project row drives its trailing icon through
 * `--martin-open-icon-color`: StyleX has no ancestor selector, so the hover
 * hand-off that used to be `group-hover:` is carried by a custom property the
 * parent recolors on `:hover` and the icon reads.
 */
export const workspaceInformationMartinCardStyles = stylex.create({
  root: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  head: {
    alignItems: "flex-start",
    display: "flex",
    gap: 10,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  icon: { color: vars.colorTextMuted, height: 16, width: 16 },
  headBody: { flex: 1, minWidth: 0 },
  titleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  staleIcon: { height: 12, width: 12 },
  headNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockStart: vars.space2,
  },
  linkedBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    marginBlockStart: vars.space12,
  },
  openProject: {
    "--martin-open-icon-color": {
      default: vars.colorTextMuted,
      ":hover": vars.colorAccent,
    },
    alignItems: "center",
    color: { default: vars.colorText, ":hover": vars.colorAccent },
    display: "flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: 6,
    maxWidth: "100%",
    textAlign: "start",
  },
  openProjectName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openProjectIcon: {
    color: "var(--martin-open-icon-color)",
    flexShrink: 0,
    height: vars.controlIconSizeSm,
    width: vars.controlIconSizeSm,
  },
  meta: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  staleNotice: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorWarningText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    paddingBlock: vars.space8,
    paddingInline: 10,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  actionIcon: { height: vars.controlIconSizeSm, width: vars.controlIconSizeSm },
  searchBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBlockStart: vars.space12,
  },
  searchForm: { display: "flex", gap: vars.space8 },
  searchInput: { height: 32 },
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
  },
  emptyResults: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    maxHeight: "13rem",
    overflowY: "auto",
  },
  resultRow: {
    alignItems: "flex-start",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: 10,
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  resultName: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { fontSize: vars.fontSizeMicro, height: 20 },
  resultSummary: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeMicro,
    lineHeight: vars.lineHeightTight,
    marginBlockStart: vars.space4,
    overflow: "hidden",
  },
});
