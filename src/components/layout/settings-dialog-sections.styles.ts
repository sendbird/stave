import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

/**
 * Styles for the Settings dialog section bodies. Names describe the element or
 * state each rule serves, not the utilities they replace.
 */
export const settingsSectionsStyles = stylex.create({
  // --- generic layout helpers ---
  stackSm: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  stackMd: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  spaceY1: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  spaceY2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  spaceY3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  spaceY4: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  spaceY8: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space32,
  },
  spaceY25: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  rowCenter: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  rowCenterGap3: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
  },
  rowWrapGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  wrapGap2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  flex1: {
    flex: 1,
  },
  minW0: {
    minInlineSize: 0,
  },
  rowBetween: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  smallMedium: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  smallMediumTruncate: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  microMutedTop1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space4,
  },
  bodyMutedTop1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginBlockStart: vars.space4,
  },

  // --- file/custom-audio controls ---
  hiddenInput: {
    display: "none",
  },
  audioNameRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  audioNameChip: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flex: 1,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    minInlineSize: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  audioIcon: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  errorText: {
    color: vars.colorDanger,
    fontSize: vars.fontSizeBody,
  },
  buttonIconLeading: {
    blockSize: vars.controlIconSizeSm,
    marginInlineEnd: vars.space4,
    inlineSize: vars.controlIconSizeSm,
  },

  // --- slider + badge value rows ---
  sliderRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
  },
  sliderFlex: {
    flex: 1,
  },
  valueBadge: {
    justifyContent: "center",
    minInlineSize: 56,
  },
  valueReadout: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
    inlineSize: vars.space48,
  },
  objectiveEnd: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    inlineSize: vars.space48,
  },
  objectiveEndRight: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    textAlign: "end",
    inlineSize: 56,
  },

  // --- project settings panel ---
  projectHeader: {
    alignItems: "start",
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  projectHeaderMain: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars.space8,
    minInlineSize: 0,
  },
  projectTitle: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.01em",
  },
  mutedBody: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  monoPath: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },
  spinIcon: {
    animationName: spin,
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  refreshIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },

  // --- appearance grid ---
  appearanceGrid: {
    display: "grid",
    gap: vars.space20,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  fieldset: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  swatchLabel: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars.ringWidthSm} ${vars.colorBorderFocus}`,
    },
    borderRadius: vars.radiusControl,
    cursor: "pointer",
  },
  swatchLabelRound: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars.ringWidthSm} ${vars.colorBorderFocus}`,
    },
    borderRadius: vars.radiusFull,
    cursor: "pointer",
  },
  iconTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorText,
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    display: "inline-flex",
    blockSize: vars.controlHeightLg,
    justifyContent: "center",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars.motionDurationFast,
    inlineSize: vars.controlHeightLg,
  },
  iconTileActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    color: vars.colorAccent,
  },
  colorTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: "transparent",
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    blockSize: vars.controlHeightLg,
    justifyContent: "center",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars.motionDurationFast,
    inlineSize: vars.controlHeightLg,
  },
  colorTileActive: {
    backgroundColor: vars.colorSelectionFill,
    borderColor: vars.colorText,
  },
  tileGlyph: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  swatchGlyph: {
    blockSize: vars.space20,
    inlineSize: vars.space20,
  },
  radioVisuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    blockSize: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    inlineSize: 1,
  },

  // --- identity preview ---
  identityPreview: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusPanel,
    display: "flex",
    gap: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  identityName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityCaption: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },

  // --- draft textareas / inputs geometry ---
  textarea140: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeBody,
    minBlockSize: 140,
  },
  textarea120Mono: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    minBlockSize: 120,
  },
  textarea110: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeBody,
    minBlockSize: 112,
  },
  input40: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    blockSize: vars.controlHeightLg,
  },
  input40Mono: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    blockSize: vars.controlHeightLg,
  },
  input40MonoPlain: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    blockSize: vars.controlHeightLg,
  },
  input9: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    blockSize: vars.controlHeightSm,
  },
  input8Mono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightXs,
  },

  // --- node_modules toggle button ---
  toggleButton: {
    alignItems: "center",
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorCanvas,
    },
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorText,
    },
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
    textAlign: "start",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars.motionDurationFast,
    inlineSize: "100%",
  },
  toggleButtonActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
  },
  toggleButtonTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  toggleButtonHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space4,
  },
  toggleBadge: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.12em",
    paddingBlock: vars.space2,
    paddingInline: vars.space8,
    textTransform: "uppercase",
  },
  toggleBadgeActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    color: vars.colorAccent,
  },

  // --- repo root/remote boxes ---
  infoBox: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    overflowWrap: "break-word",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    wordBreak: "break-all",
  },
  remoteCard: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  remoteName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  remoteBadge: {
    blockSize: vars.space20,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.04em",
    paddingInline: vars.space8,
    textTransform: "uppercase",
  },
  remoteMono: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space4,
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },

  // --- danger zone ---
  dangerZone: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  dangerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  dangerTitle: {
    color: vars.colorDanger,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  iconMd: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  iconSm: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  iconXs: {
    blockSize: vars.space12,
    inlineSize: vars.space12,
  },

  // --- workspace tools card ---
  toolsBadge: {
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightRegular,
    paddingBlock: vars.space2,
    paddingInline: vars.space8,
  },
  titleAccessoryButton: {
    gap: vars.space8,
  },

  // --- appearance/theme buttons ---
  appearanceGridButtons: {
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  modeButton: {
    blockSize: vars.controlHeightLg,
    inlineSize: "100%",
    justifyContent: "center",
  },

  // --- theme editor toolbar ---
  tokenToolbar: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
    padding: vars.space12,
  },

  // --- theme motion divider ---
  motionExpanded: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space12,
    marginBlockStart: vars.space12,
    paddingBlockStart: vars.space12,
  },

  // --- theme preset card ---
  themeCard: {
    alignItems: {
      default: null,
      "@media (min-width: 640px)": "center",
    },
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorCanvasSubtle,
    },
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorAccent,
    },
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space12,
    padding: vars.space16,
    position: "relative",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars.motionDurationFast,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "1fr auto",
    },
  },
  themeCardActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    boxShadow: `0 0 0 1px ${vars.colorAccent}`,
  },
  themeCardButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    display: "grid",
    gap: vars.space8,
    padding: 0,
    textAlign: "start",
  },
  themeCardName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  microBadge: {
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  activeMark: {
    alignItems: "center",
    color: vars.colorAccent,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    marginInlineStart: {
      default: "auto",
      "@media (min-width: 640px)": 0,
    },
  },
  themeDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  themeAuthor: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  themeRightCol: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  swatchStrip: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  swatchDot: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    blockSize: vars.space24,
    inlineSize: vars.space24,
  },
  cardActionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  smallGhostButton: {
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightXs,
    paddingInline: vars.space8,
  },
  smallGhostButtonDanger: {
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightXs,
    paddingInline: vars.space8,
  },

  // --- theme import ---
  importGrid: {
    display: "grid",
    gap: vars.space8,
  },
  importRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
  },
  importButton: {
    gap: vars.space8,
  },
  importErrorBox: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  importHelp: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: vars.lineHeightRelaxed,
  },
  code: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeMicro,
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },

  // --- theme token row ---
  tokenRow: {
    alignItems: {
      default: null,
      "@media (min-width: 1024px)": "center",
    },
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space12,
    padding: vars.space16,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "190px 52px 1fr auto",
    },
  },
  tokenName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  tokenPreset: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  tokenSwatch: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    blockSize: vars.controlHeightXl,
    inlineSize: 44,
  },

  // --- model selector triggers ---
  modelTrigger: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorCanvasSubtle,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    blockSize: vars.controlHeightLg,
    maxInlineSize: "none",
    paddingInline: vars.space12,
    inlineSize: "100%",
  },
  modelMenu: {
    maxInlineSize: {
      default: null,
      "@media (min-width: 640px)": "32rem",
    },
  },
  selectTrigger: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorCanvasSubtle,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    blockSize: vars.controlHeightLg,
    maxInlineSize: "none",
    paddingInline: vars.space12,
    inlineSize: "100%",
  },
  fullWidth: {
    inlineSize: "100%",
  },

  // --- auto routing block ---
  routingBlock: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingBlockStart: vars.space12,
  },
  routingHeader: {
    alignItems: "start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  routingTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  accentGlyph: {
    color: vars.colorTextMuted,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  routingGrid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 768px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  smallTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },

  // --- skills roots/catalog ---
  metaLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  listCard: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  smallBadge: {
    blockSize: vars.space20,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.04em",
    paddingInline: vars.space8,
    textTransform: "uppercase",
  },
  smallBadgePlain: {
    blockSize: vars.space20,
    fontSize: vars.fontSizeMicro,
    paddingInline: vars.space8,
  },
  groupCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  groupToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderWidth: 0,
    cursor: "pointer",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    textAlign: "start",
    inlineSize: "100%",
  },
  groupToggleLeft: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    minInlineSize: 0,
  },
  chevron: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  groupBody: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  skillMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // --- command palette / shortcut rows ---
  shortcutCard: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  shortcutRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
    },
  },
  shortcutLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minInlineSize: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      inlineSize: 256,
    },
  },
  shortcutLeadNarrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minInlineSize: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      inlineSize: 208,
    },
  },
  shortcutMain: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    gap: vars.space8,
    minInlineSize: 0,
  },
  seqRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  seqThen: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  selectTriggerPlain: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    blockSize: vars.controlHeightLg,
    inlineSize: "100%",
  },
  selectTriggerEffort: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    flex: 1,
    blockSize: vars.controlHeightSm,
    minInlineSize: 0,
  },
  selectContentTall: {
    maxBlockSize: 320,
  },
  selectContentEffortRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  effortLabel: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  captionMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  microMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  monoMicroMuted: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },

  // --- command visibility rows ---
  commandCard: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  commandRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  commandInfo: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    minInlineSize: 0,
  },
  commandTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  mediumText: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  commandActions: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars.space8,
  },
  paletteButtonsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  contributorCopy: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
  },

  // --- model shortcut option label ---
  modelOptionLabel: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  modelOptionGlyph: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },

  // --- prompt field reset ---
  promptTextarea: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    minBlockSize: 120,
    resize: "vertical",
  },
  promptFooter: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  promptState: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  promptStateCustom: {
    color: vars.colorAccent,
    fontSize: vars.fontSizeCaption,
  },
  resetButton: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    blockSize: vars.controlHeightXs,
  },

  // --- lens session buttons ---
  clearButtonsGrid: {
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  clearButton: {
    gap: vars.space8,
    justifyContent: "flex-start",
  },

  // --- lens cdp hosts ---
  cdpLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  cdpInputRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    "@media (min-width: 640px)": {
      flexDirection: "row",
    },
  },
  cdpAddButton: {
    gap: vars.space8,
    justifyContent: "center",
    "@media (min-width: 640px)": {
      inlineSize: "auto",
    },
  },
  cdpHelp: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  cdpHostList: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  cdpHostBadge: {
    borderRadius: vars.radiusMark,
    gap: vars.space4,
    paddingInlineEnd: vars.space4,
  },
  cdpHostText: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    maxInlineSize: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
