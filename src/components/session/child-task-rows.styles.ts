import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const childTaskRowsStyles = stylex.create({
  row: {
    minWidth: 0,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: "0.625rem",
    paddingBlock: vars.space8,
  },
  rowBorderDefault: { borderColor: vars.colorBorder },
  rowBorderBlocked: { borderColor: vars.colorWarningBorder },
  headerRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars.space8,
    rowGap: vars.space4,
  },
  phaseBadge: {
    flexShrink: 0,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  // The row's title, so it takes the row-title step rather than sitting a
  // rung under the metadata it labels.
  delegationName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  metaText: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  metaTextNums: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
    color: vars.colorTextMuted,
  },
  // Consequential prose — why a child task is blocked, why it stopped, what
  // failed. Micro is the badge-count step, not a step for text a user has to
  // read to act on.
  blockedHint: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorWarning,
  },
  reasonText: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorTextMuted,
  },
  errorText: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorDanger,
  },
  actionsRow: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
  },
  composer: {
    marginTop: "0.375rem",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    padding: vars.space8,
  },
  composerLabel: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  composerTextarea: {
    marginTop: vars.space4,
    minHeight: "4rem",
    resize: "vertical",
    backgroundColor: vars.colorCanvas,
    fontSize: vars.fontSizeCaption,
  },
  composerActions: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
  },
  composerHint: { fontSize: vars.fontSizeMicro, color: vars.colorTextMuted },
  // Glyph inside a control, so it takes the control-icon floor rather than a
  // raw 12px that reads as a status mark.
  actionIcon: { width: vars.controlIconSizeSm, height: vars.controlIconSizeSm },
  backlink: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars.space8,
    rowGap: vars.space4,
  },
  backlinkLabel: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: vars.colorTextMuted,
  },
  /* A parent task's title, not a chip: Micro is the badge-count step and this
     is the row's one orienting label. */
  backlinkTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    color: vars.colorText,
  },
  /* Body-semibold, and no uppercase or tracking: those were standing in
     for a hierarchy the step now supplies directly, and at 11px they cost
     the x-height and word-shape cues that make a header scannable in the
     first place. Matches the section headers in the changes panel and the
     workspace sidebar. */
  sectionHeading: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorTextMuted,
  },
  sectionRoot: { minWidth: 0 },
  sectionList: {
    marginTop: "0.375rem",
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
    gap: "0.375rem",
  },
});

/** The phase tones, one style object per tone, colors from `vars`. */
export const childTaskPhaseToneStyles = stylex.create({
  active: {
    borderColor: vars.colorAccent,
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  waiting: {
    borderColor: vars.colorWarningBorder,
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarning,
  },
  done: {
    borderColor: vars.colorSuccessBorder,
    backgroundColor: vars.colorSuccessSoft,
    color: vars.colorSuccess,
  },
  failed: {
    borderColor: vars.colorDangerBorder,
    backgroundColor: vars.colorDangerSoft,
    color: vars.colorDanger,
  },
  released: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    color: vars.colorTextMuted,
  },
});
