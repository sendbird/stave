import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The chevron rotates with the disclosure's open state. StyleX conditions only
 * see the element they sit on, and `<details>[open]` is an ancestor of the
 * chevron, so the open state travels down as a custom property the chevron
 * reads for its transform.
 */
const CHEVRON_ROTATE = "--taskContextChevronRotate";

export const taskSourceContextNoticeStyles = stylex.create({
  root: {
    marginBottom: vars.space8,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  headerRow: { display: "flex", alignItems: "center", gap: vars.space8 },
  headerIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: vars.colorTextMuted,
  },
  headerText: { minWidth: 0, flex: 1 },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  subtitle: { fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
  clearButton: {
    flexShrink: 0,
    borderRadius: vars.radiusControl,
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  staleNotice: {
    marginTop: vars.space8,
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorWarningBorder,
    backgroundColor: vars.colorWarningSoft,
    paddingInline: "0.625rem",
    paddingBlock: "0.375rem",
    fontSize: vars.fontSizeCaption,
    color: vars.colorText,
  },
  staleIcon: {
    marginTop: "0.125rem",
    width: 14,
    height: 14,
    flexShrink: 0,
    color: vars.colorWarning,
  },
  staleBody: { minWidth: 0, flex: 1 },
  refreshButton: {
    marginTop: vars.space4,
    borderRadius: vars.radiusControl,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
    color: {
      default: "inherit",
      ":hover": vars.colorText,
    },
  },
  details: {
    marginTop: "0.375rem",
    [CHEVRON_ROTATE]: { default: "0deg", ":is([open])": "180deg" },
  },
  summary: {
    display: "flex",
    width: "fit-content",
    cursor: "pointer",
    listStyle: "none",
    alignItems: "center",
    gap: vars.space4,
    borderRadius: vars.radiusControl,
    paddingBlock: vars.space4,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    outlineStyle: "none",
    "::-webkit-details-marker": { display: "none" },
  },
  summaryChevron: {
    width: 14,
    height: 14,
    transform: `rotate(${CHEVRON_ROTATE})`,
    transitionProperty: "transform",
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  attachedList: {
    marginTop: "0.375rem",
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    maxHeight: "14rem",
    overflowY: "auto",
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: vars.colorBorder,
    paddingLeft: vars.space12,
  },
  attachedHeaderRow: {
    marginBottom: vars.space4,
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
  },
  attachedTitle: {
    minWidth: 0,
    flex: 1,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  staleTag: {
    marginLeft: "0.375rem",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightRegular,
    color: vars.colorWarning,
  },
  removeButton: {
    flexShrink: 0,
    borderRadius: vars.radiusControl,
    padding: "0.125rem",
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  removeIcon: { width: 14, height: 14 },
  attachedContent: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    color: vars.colorTextMuted,
  },
});
