import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Styles for the shared Settings primitives (`SettingsCard`, `LabeledField`,
 * `SwitchField`, `ChoiceButtons`, `ToggleChipGroup`, and friends). These
 * components are consumed by every settings section, so their public prop
 * shapes are frozen; only their internal styling moved to StyleX.
 */
export const settingsSharedStyles = stylex.create({
  statusBadge: {
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontWeight: vars.fontWeightMedium,
    height: 24,
    letterSpacing: "normal",
    paddingInline: 10,
  },
  statusBadgeReady: {
    backgroundColor: vars.colorSuccessSoft,
    borderColor: vars.colorSuccessBorder,
    color: vars.colorSuccessText,
  },
  statusBadgeWarning: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  statusBadgeError: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },

  infoRow: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space12,
    justifyContent: "space-between",
  },
  infoRowLabel: {
    color: vars.colorTextMuted,
  },
  infoRowValue: {
    color: vars.colorText,
    maxWidth: "70%",
    overflowWrap: "break-word",
    textAlign: "end",
    wordBreak: "break-all",
  },
  infoRowValueMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },

  sectionStack: {
    display: "flex",
    flexDirection: "column",
  },

  card: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    borderBottomStyle: {
      default: null,
      ":last-child": "solid",
    },
    borderBottomWidth: {
      default: null,
      ":last-child": vars.borderWidthHairline,
    },
    borderBottomColor: {
      default: null,
      ":last-child": vars.colorBorder,
    },
    outline: "none",
    paddingBlock: 28,
    paddingTop: {
      default: 28,
      ":first-child": 0,
    },
    scrollMarginTop: vars.space24,
  },
  cardHeaderRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  cardTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.015em",
  },
  cardDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    marginTop: 6,
    maxWidth: "56rem",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    marginTop: vars.space20,
  },

  choiceMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderRadius: 5,
    display: "flex",
    flexShrink: 0,
    height: vars.space20,
    justifyContent: "center",
    width: vars.space20,
  },

  radioGroupGrid: {
    display: "grid",
    gap: vars.space8,
  },
  radioGroupGridCols2: {
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  radioGroupGridCols3: {
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  radioGroupInline: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    flexWrap: "wrap",
    maxWidth: "100%",
    padding: 2,
  },
  radio: {
    alignItems: "center",
    backgroundClip: "padding-box",
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": vars.colorAccent,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: {
      default: null,
      ":is([data-checked])": vars.colorAccentText,
    },
    cursor: "default",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    opacity: {
      default: null,
      ":is([data-disabled])": 0.45,
    },
    outline: "none",
    pointerEvents: {
      default: null,
      ":is([data-disabled])": "none",
    },
    transitionDuration: "150ms",
    transitionProperty:
      "background-color, border-color, color, box-shadow, transform, opacity",
    transitionTimingFunction: vars.motionEaseStandard,
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  radioCard: {
    alignItems: "flex-start",
    backgroundColor: {
      default: vars.colorSurface,
      ":is([data-unchecked]:hover)": vars.colorSelectionFill,
    },
    borderColor: {
      default: vars.colorBorder,
      ":is([data-unchecked]:hover)": vars.colorAccent,
    },
    height: "auto",
    justifyContent: "flex-start",
    minHeight: 56,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
    textAlign: "start",
    whiteSpace: "normal",
  },
  radioSegment: {
    borderRadius: 5,
    color: {
      default: vars.colorTextMuted,
      ":is([data-unchecked]:hover)": vars.colorText,
    },
    backgroundColor: {
      default: null,
      ":is([data-unchecked]:hover)": vars.colorOverlayHover,
    },
    fontSize: 13,
    height: vars.controlHeightSm,
    paddingInline: 14,
  },
  radioContent: {
    alignItems: "flex-start",
    display: "flex",
    gap: 10,
    minWidth: 0,
  },
  radioTextWrap: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  radioLabel: {
    fontSize: 15,
    fontWeight: vars.fontWeightMedium,
  },
  radioDescription: {
    fontSize: vars.fontSizeBody,
    opacity: 0.75,
  },
  radioInline: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },

  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  toggle: {
    backgroundColor: {
      default: vars.colorSurface,
      ':is([aria-pressed="true"])': vars.colorAccent,
    },
    borderColor: {
      default: vars.colorBorder,
      ':is([aria-pressed="true"])': "transparent",
    },
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: {
      default: vars.colorText,
      ':is([aria-pressed="true"])': vars.colorAccentText,
    },
    fontSize: 13,
    height: vars.controlHeightXs,
    paddingInline: 14,
  },
  toggleWithMark: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  toggleCheck: {
    height: 12,
    width: 12,
  },
  toggleLabel: {
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tooltipContent: {
    fontSize: vars.fontSizeCaption,
    maxWidth: 256,
  },

  fieldStacked: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  fieldGrid: {
    alignItems: "start",
    display: "grid",
    gap: vars.space20,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)":
        "minmax(15rem, 0.85fr) minmax(20rem, 1.15fr)",
    },
  },
  fieldLabelBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  fieldLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  fieldTitle: {
    fontSize: 15,
    fontWeight: vars.fontWeightMedium,
  },
  fieldDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
  },
  fieldControl: {
    minWidth: 0,
  },

  switchRow: {
    alignItems: "start",
    display: "grid",
    gap: vars.space20,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)":
        "minmax(15rem, 0.85fr) minmax(20rem, 1.15fr)",
    },
    minHeight: vars.controlHeightLg,
  },
  switchLabelBlock: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars.space4,
    minWidth: 0,
  },
  switchControl: {
    flexShrink: 0,
    justifySelf: "start",
    marginTop: 2,
  },

  selectTrigger: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    fontSize: vars.fontSizeBody,
    height: vars.controlHeightLg,
    width: "100%",
  },

  guideTriggerIcon: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
  },
  guideIcon: {
    height: vars.controlIconSizeSm,
    width: vars.controlIconSizeSm,
  },
  guideTriggerInline: {
    display: "inline-flex",
  },
  guidePopover: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    maxWidth: "calc(100vw - 2rem)",
    width: "24rem",
  },
  guideHeader: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    paddingBlock: 0,
    paddingInline: 0,
  },
  guideTitle: {
    fontSize: vars.fontSizeBody,
  },
  guideList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  guideItem: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  guideItemLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  guideItemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
  guideExampleLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  guideNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
});
