import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const controlPanelStyles = stylex.create({
  panel: {
    backgroundColor: vars.colorSurface,
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    outlineStyle: {
      default: null,
      ":focus": "none",
    },
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  headerText: {
    minWidth: 0,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    marginTop: vars.space2,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space4,
  },
  /** Every control in this panel keeps a comfortable pointer target. */
  action: {
    minHeight: 36,
  },
  closeAction: {
    minHeight: 36,
    minWidth: 36,
  },
  actionIcon: {
    height: 14,
    width: 14,
  },
  closeIcon: {
    height: 16,
    width: 16,
  },
  stopIcon: {
    fill: "currentColor",
    height: 14,
    width: 14,
  },
  section: {
    marginTop: vars.space12,
  },
  staleNotice: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorWarningText,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  replyCard: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginTop: vars.space12,
    padding: vars.space12,
  },
  replyLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  replyHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    marginTop: vars.space2,
  },
  replyInput: {
    backgroundColor: vars.colorCanvas,
    marginTop: vars.space8,
    minHeight: 80,
    resize: "vertical",
  },
  replyActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  managedNotice: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  turnFooter: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    marginTop: vars.space12,
    paddingTop: vars.space12,
  },
  turnText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    minWidth: 0,
  },
  turnId: {
    fontFamily: vars.fontMono,
  },
  status: {
    fontSize: vars.fontSizeMicro,
    marginTop: vars.space8,
    minHeight: 16,
  },
  statusNeutral: {
    color: vars.colorTextMuted,
  },
  statusSuccess: {
    color: vars.colorSuccessText,
  },
  statusError: {
    color: vars.colorDangerText,
  },
});
