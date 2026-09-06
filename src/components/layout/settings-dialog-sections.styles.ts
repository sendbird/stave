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
    gap: 10,
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
    minWidth: 0,
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
    marginTop: vars.space4,
  },
  bodyMutedTop1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space4,
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
    minWidth: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  audioIcon: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
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
    height: 14,
    marginInlineEnd: vars.space4,
    width: 14,
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
    minWidth: 56,
  },
  valueReadout: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
    width: 48,
  },
  objectiveEnd: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    width: 48,
  },
  objectiveEndRight: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    textAlign: "end",
    width: 56,
  },

  // --- project settings panel ---
  projectHeader: {
    alignItems: "flex-start",
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
    minWidth: 0,
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
    height: 14,
    width: 14,
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  refreshIcon: {
    height: 14,
    width: 14,
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
      default: null,
      ":hover": vars.colorOverlayHover,
    },
    display: "inline-flex",
    height: vars.controlHeightLg,
    justifyContent: "center",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars.motionDurationFast,
    width: vars.controlHeightLg,
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
    height: vars.controlHeightLg,
    justifyContent: "center",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars.motionDurationFast,
    width: vars.controlHeightLg,
  },
  colorTileActive: {
    backgroundColor: vars.colorSelectionFill,
    borderColor: vars.colorText,
  },
  tileGlyph: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  swatchGlyph: {
    height: vars.space20,
    width: vars.space20,
  },
  radioVisuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },

  // --- identity preview ---
  identityPreview: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusPanel,
    display: "flex",
    gap: vars.space12,
    paddingBlock: 10,
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
    minHeight: 140,
  },
  textarea120Mono: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    minHeight: 120,
  },
  textarea110: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeBody,
    minHeight: 110,
  },
  input40: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    height: vars.controlHeightLg,
  },
  input40Mono: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    height: vars.controlHeightLg,
  },
  input40MonoPlain: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    height: vars.controlHeightLg,
  },
  input9: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    height: vars.controlHeightSm,
  },
  input8Mono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightXs,
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
    width: "100%",
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
    marginTop: vars.space4,
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
    paddingBlock: 2,
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
    paddingBlock: 10,
    paddingInline: vars.space12,
    wordBreak: "break-all",
  },
  remoteCard: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: 10,
    paddingInline: vars.space12,
  },
  remoteName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  remoteBadge: {
    height: 20,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.04em",
    paddingInline: 6,
    textTransform: "uppercase",
  },
  remoteMono: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
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
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  iconSm: {
    height: 14,
    width: 14,
  },
  iconXs: {
    height: 12,
    width: 12,
  },

  // --- workspace tools card ---
  toolsBadge: {
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightRegular,
    paddingBlock: 2,
    paddingInline: vars.space8,
  },
  titleAccessoryButton: {
    gap: 6,
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
    height: vars.controlHeightLg,
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
    borderTopWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space12,
    marginTop: vars.space12,
    paddingTop: vars.space12,
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
    gap: 6,
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
    height: vars.space24,
    width: vars.space24,
  },
  cardActionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  smallGhostButton: {
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightXs,
    paddingInline: vars.space8,
  },
  smallGhostButtonDanger: {
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightXs,
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
    gap: 6,
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
    paddingBlock: 2,
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
    height: 44,
    width: 44,
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
    height: vars.controlHeightLg,
    maxWidth: "none",
    paddingInline: vars.space12,
    width: "100%",
  },
  modelMenu: {
    maxWidth: {
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
    height: vars.controlHeightLg,
    maxWidth: "none",
    paddingInline: vars.space12,
    width: "100%",
  },
  fullWidth: {
    width: "100%",
  },

  // --- auto routing block ---
  routingBlock: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingTop: vars.space12,
  },
  routingHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  routingTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  accentGlyph: {
    color: vars.colorAccent,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
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
    height: 20,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.04em",
    paddingInline: 6,
    textTransform: "uppercase",
  },
  smallBadgePlain: {
    height: 20,
    fontSize: vars.fontSizeMicro,
    paddingInline: 6,
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
    width: "100%",
  },
  groupToggleLeft: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    minWidth: 0,
  },
  chevron: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  groupBody: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  skillMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: 2,
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
      alignItems: "flex-start",
      flexDirection: "row",
    },
  },
  shortcutLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      width: 256,
    },
  },
  shortcutLeadNarrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      width: 208,
    },
  },
  shortcutMain: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    gap: vars.space8,
    minWidth: 0,
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
    height: vars.controlHeightLg,
    width: "100%",
  },
  selectTriggerEffort: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    flex: 1,
    height: vars.controlHeightSm,
    minWidth: 0,
  },
  selectContentTall: {
    maxHeight: 320,
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
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  commandInfo: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    minWidth: 0,
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
    minWidth: 0,
  },
  modelOptionGlyph: {
    height: 14,
    width: 14,
  },

  // --- prompt field reset ---
  promptTextarea: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    minHeight: 120,
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
    gap: 6,
    height: vars.controlHeightXs,
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
    gap: 6,
    justifyContent: "center",
    "@media (min-width: 640px)": {
      width: "auto",
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
    maxWidth: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
