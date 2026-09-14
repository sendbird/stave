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
    gap: vars["--ads-space-8"],
  },
  stackMd: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  spaceY1: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  spaceY2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  spaceY3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  spaceY4: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  spaceY8: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-32"],
  },
  spaceY25: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  rowCenter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  rowCenterGap3: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  rowWrapGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  wrapGap2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
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
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  smallMedium: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  smallMediumTruncate: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  microMutedTop1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
  },
  bodyMutedTop1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
  },

  // --- file/custom-audio controls ---
  hiddenInput: {
    display: "none",
  },
  audioNameRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  audioNameChip: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  audioIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  errorText: {
    color: vars["--ads-color-danger"],
    fontSize: vars["--ads-font-size-body"],
  },
  buttonIconLeading: {
    blockSize: vars["--ads-control-icon-size-sm"],
    marginInlineEnd: vars["--ads-space-4"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },

  // --- slider + badge value rows ---
  sliderRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  sliderFlex: {
    flex: 1,
  },
  valueBadge: {
    justifyContent: "center",
    minInlineSize: 56,
  },
  valueReadout: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
    inlineSize: vars["--ads-space-48"],
  },
  objectiveEnd: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    inlineSize: vars["--ads-space-48"],
  },
  objectiveEndRight: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    textAlign: "end",
    inlineSize: 56,
  },

  // --- project settings panel ---
  projectHeader: {
    alignItems: "start",
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  projectHeaderMain: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  projectTitle: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.01em",
  },
  mutedBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  monoPath: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },
  spinIcon: {
    animationName: spin,
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  refreshIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },

  // --- appearance grid ---
  appearanceGrid: {
    display: "grid",
    gap: vars["--ads-space-20"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  fieldset: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  swatchLabel: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars["--ads-ring-width-sm"]} ${vars["--ads-color-border-focus"]}`,
    },
    borderRadius: vars["--ads-radius-control"],
    cursor: "pointer",
  },
  swatchLabelRound: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars["--ads-ring-width-sm"]} ${vars["--ads-color-border-focus"]}`,
    },
    borderRadius: vars["--ads-radius-full"],
    cursor: "pointer",
  },
  iconTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: {
      default: vars["--ads-color-border"],
      ":hover": vars["--ads-color-text"],
    },
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    display: "inline-flex",
    blockSize: vars["--ads-control-height-lg"],
    justifyContent: "center",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    inlineSize: vars["--ads-control-height-lg"],
  },
  iconTileActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent"],
  },
  colorTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    blockSize: vars["--ads-control-height-lg"],
    justifyContent: "center",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    inlineSize: vars["--ads-control-height-lg"],
  },
  colorTileActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: vars["--ads-color-text"],
  },
  tileGlyph: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  swatchGlyph: {
    blockSize: vars["--ads-space-20"],
    inlineSize: vars["--ads-space-20"],
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
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  identityName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityCaption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },

  // --- draft textareas / inputs geometry ---
  textarea140: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-body"],
    minBlockSize: 140,
  },
  textarea120Mono: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    minBlockSize: 120,
  },
  textarea110: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-body"],
    minBlockSize: 112,
  },
  input40: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    blockSize: vars["--ads-control-height-lg"],
  },
  input40Mono: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    blockSize: vars["--ads-control-height-lg"],
  },
  input40MonoPlain: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    fontFamily: vars["--ads-font-mono"],
    blockSize: vars["--ads-control-height-lg"],
  },
  input9: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    blockSize: vars["--ads-control-height-sm"],
  },
  input8Mono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-xs"],
  },

  // --- node_modules toggle button ---
  toggleButton: {
    alignItems: "center",
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas"],
    },
    borderColor: {
      default: vars["--ads-color-border"],
      ":hover": vars["--ads-color-text"],
    },
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    inlineSize: "100%",
  },
  toggleButtonActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
  },
  toggleButtonTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  toggleButtonHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
  },
  toggleBadge: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.12em",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-8"],
    textTransform: "uppercase",
  },
  toggleBadgeActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent"],
  },

  // --- repo root/remote boxes ---
  infoBox: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflowWrap: "break-word",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    wordBreak: "break-all",
  },
  remoteCard: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  remoteName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  remoteBadge: {
    blockSize: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.04em",
    paddingInline: vars["--ads-space-8"],
    textTransform: "uppercase",
  },
  remoteMono: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },

  // --- danger zone ---
  dangerZone: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  dangerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  dangerTitle: {
    color: vars["--ads-color-danger"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  iconMd: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  iconSm: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  iconXs: {
    blockSize: vars["--ads-space-12"],
    inlineSize: vars["--ads-space-12"],
  },

  // --- workspace tools card ---
  toolsBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-8"],
  },
  titleAccessoryButton: {
    gap: vars["--ads-space-8"],
  },

  // --- appearance/theme buttons ---
  appearanceGridButtons: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  modeButton: {
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "100%",
    justifyContent: "center",
  },

  // --- theme editor toolbar ---
  tokenToolbar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    padding: vars["--ads-space-12"],
  },

  // --- theme motion divider ---
  motionExpanded: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-12"],
    marginBlockStart: vars["--ads-space-12"],
    paddingBlockStart: vars["--ads-space-12"],
  },

  // --- theme preset card ---
  themeCard: {
    alignItems: {
      default: null,
      "@media (min-width: 640px)": "center",
    },
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas-subtle"],
    },
    borderColor: {
      default: vars["--ads-color-border"],
      ":hover": vars["--ads-color-accent"],
    },
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
    position: "relative",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "1fr auto",
    },
  },
  themeCardActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    boxShadow: `0 0 0 1px ${vars["--ads-color-accent"]}`,
  },
  themeCardButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    display: "grid",
    gap: vars["--ads-space-8"],
    padding: 0,
    textAlign: "start",
  },
  themeCardName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  microBadge: {
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  activeMark: {
    alignItems: "center",
    color: vars["--ads-color-accent"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    marginInlineStart: {
      default: "auto",
      "@media (min-width: 640px)": 0,
    },
  },
  themeDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  themeAuthor: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  themeRightCol: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  swatchStrip: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
  },
  swatchDot: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-space-24"],
    inlineSize: vars["--ads-space-24"],
  },
  cardActionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
  },
  smallGhostButton: {
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
  },
  smallGhostButtonDanger: {
    color: vars["--ads-color-danger"],
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
  },

  // --- theme import ---
  importGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  importRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  importButton: {
    gap: vars["--ads-space-8"],
  },
  importErrorBox: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  importHelp: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  code: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },

  // --- theme token row ---
  tokenRow: {
    alignItems: {
      default: null,
      "@media (min-width: 1024px)": "center",
    },
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "190px 52px 1fr auto",
    },
  },
  tokenName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  tokenPreset: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  tokenSwatch: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-control-height-xl"],
    inlineSize: 44,
  },

  // --- model selector triggers ---
  modelTrigger: {
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas-subtle"],
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--ads-space-12"],
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
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas-subtle"],
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  fullWidth: {
    inlineSize: "100%",
  },

  // --- auto routing block ---
  routingBlock: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlockStart: vars["--ads-space-12"],
  },
  routingHeader: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  routingTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  accentGlyph: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  routingGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 768px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  smallTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },

  // --- skills roots/catalog ---
  metaLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  listCard: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  smallBadge: {
    blockSize: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.04em",
    paddingInline: vars["--ads-space-8"],
    textTransform: "uppercase",
  },
  smallBadgePlain: {
    blockSize: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-micro"],
    paddingInline: vars["--ads-space-8"],
  },
  groupCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  groupToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderWidth: 0,
    cursor: "pointer",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
    inlineSize: "100%",
  },
  groupToggleLeft: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  chevron: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  groupBody: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  skillMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // --- command palette / shortcut rows ---
  shortcutCard: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  shortcutRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
    },
  },
  shortcutLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      inlineSize: 256,
    },
  },
  shortcutLeadNarrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
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
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  seqRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  seqThen: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  selectTriggerPlain: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "100%",
  },
  selectTriggerEffort: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    flex: 1,
    blockSize: vars["--ads-control-height-sm"],
    minInlineSize: 0,
  },
  selectContentTall: {
    maxBlockSize: 320,
  },
  selectContentEffortRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  effortLabel: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  captionMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  microMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  monoMicroMuted: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },

  // --- command visibility rows ---
  commandCard: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  commandRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  commandInfo: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  commandTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  mediumText: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  commandActions: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  paletteButtonsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  contributorCopy: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },

  // --- model shortcut option label ---
  modelOptionLabel: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  modelOptionGlyph: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },

  // --- prompt field reset ---
  promptTextarea: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    minBlockSize: 120,
    resize: "vertical",
  },
  promptFooter: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  promptState: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  promptStateCustom: {
    color: vars["--ads-color-accent"],
    fontSize: vars["--ads-font-size-caption"],
  },
  resetButton: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-xs"],
  },

  // --- lens session buttons ---
  clearButtonsGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  clearButton: {
    gap: vars["--ads-space-8"],
    justifyContent: "flex-start",
  },

  // --- lens cdp hosts ---
  cdpLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  cdpInputRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    "@media (min-width: 640px)": {
      flexDirection: "row",
    },
  },
  cdpAddButton: {
    gap: vars["--ads-space-8"],
    justifyContent: "center",
    "@media (min-width: 640px)": {
      inlineSize: "auto",
    },
  },
  cdpHelp: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  cdpHostList: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  cdpHostBadge: {
    borderRadius: vars["--ads-radius-mark"],
    gap: vars["--ads-space-4"],
    paddingInlineEnd: vars["--ads-space-4"],
  },
  cdpHostText: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    maxInlineSize: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
