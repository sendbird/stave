import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    gap: vars["--aui-space-8"],
  },
  stackMd: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  spaceY1: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  spaceY2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  spaceY3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  spaceY4: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  spaceY8: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-32"],
  },
  spaceY25: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  rowCenter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  rowCenterGap3: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
  },
  rowWrapGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  wrapGap2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
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
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  smallMedium: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  smallMediumTruncate: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  microMutedTop1: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-4"],
  },
  bodyMutedTop1: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    marginBlockStart: vars["--aui-space-4"],
  },

  // --- file/custom-audio controls ---
  audioNameRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  audioNameChip: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  audioIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  errorText: {
    color: vars["--aui-color-danger"],
    fontSize: vars["--aui-font-size-body"],
  },
  buttonIconLeading: {
    blockSize: vars["--aui-control-icon-size-sm"],
    marginInlineEnd: vars["--aui-space-4"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },

  // --- slider + badge value rows ---
  sliderRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
  },
  sliderFlex: {
    flex: 1,
  },
  valueBadge: {
    justifyContent: "center",
    minInlineSize: 56,
  },
  valueReadout: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
    inlineSize: vars["--aui-space-48"],
  },
  objectiveEnd: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    inlineSize: vars["--aui-space-48"],
  },
  objectiveEndRight: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    textAlign: "end",
    inlineSize: 56,
  },

  // --- project settings panel ---
  repositoryHeader: {
    alignItems: "start",
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  repositoryHeaderMain: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  repositoryTitle: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.01em",
  },
  mutedBody: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  monoPath: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },
  spinIcon: {
    animationName: spin,
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  refreshIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },

  // --- appearance grid ---
  appearanceGrid: {
    display: "grid",
    gap: vars["--aui-space-20"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  fieldset: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  swatchLabel: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-border-focus"]}`,
    },
    borderRadius: vars["--aui-radius-control"],
    cursor: "pointer",
  },
  swatchLabelRound: {
    "--tileFocusRing": {
      default: "0 0 0 0 transparent",
      ":has(:focus-visible)": `0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-border-focus"]}`,
    },
    borderRadius: vars["--aui-radius-full"],
    cursor: "pointer",
  },
  iconTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-text"],
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    display: "inline-flex",
    blockSize: vars["--aui-control-height-lg"],
    justifyContent: "center",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    inlineSize: vars["--aui-control-height-lg"],
  },
  iconTileActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent"],
  },
  colorTile: {
    alignItems: "center",
    boxShadow: "var(--tileFocusRing, 0 0 0 0 transparent)",
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "inline-flex",
    blockSize: vars["--aui-control-height-lg"],
    justifyContent: "center",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    inlineSize: vars["--aui-control-height-lg"],
  },
  colorTileActive: {
    backgroundColor: vars["--aui-color-selection-fill"],
    borderColor: vars["--aui-color-text"],
  },
  tileGlyph: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  swatchGlyph: {
    blockSize: vars["--aui-space-20"],
    inlineSize: vars["--aui-space-20"],
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
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  identityName: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  identityCaption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },

  // --- draft textareas / inputs geometry ---
  textarea140: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-body"],
    minBlockSize: 140,
  },
  textarea120Mono: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
    minBlockSize: 120,
  },
  textarea110: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-body"],
    minBlockSize: 112,
  },
  input40: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    blockSize: vars["--aui-control-height-lg"],
  },
  input40Mono: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
    blockSize: vars["--aui-control-height-lg"],
  },
  input40MonoPlain: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    fontFamily: vars["--aui-font-mono"],
    blockSize: vars["--aui-control-height-lg"],
  },
  input9: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
    blockSize: vars["--aui-control-height-sm"],
  },
  input8Mono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-xs"],
  },

  // --- node_modules toggle button ---
  toggleButton: {
    alignItems: "center",
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-canvas"],
    },
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-text"],
    },
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "start",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    inlineSize: "100%",
  },
  toggleButtonActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
  },
  toggleButtonTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  toggleButtonHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-4"],
  },
  toggleBadge: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.12em",
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-8"],
    textTransform: "uppercase",
  },
  toggleBadgeActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent"],
  },

  // --- repo root/remote boxes ---
  infoBox: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflowWrap: "break-word",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    wordBreak: "break-all",
  },
  remoteCard: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  remoteName: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  remoteBadge: {
    blockSize: vars["--aui-space-20"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.04em",
    paddingInline: vars["--aui-space-8"],
    textTransform: "uppercase",
  },
  remoteMono: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-4"],
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },

  // --- danger zone ---
  dangerZone: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  dangerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  dangerTitle: {
    color: vars["--aui-color-danger"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  iconMd: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  iconSm: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  iconXs: {
    blockSize: vars["--aui-space-12"],
    inlineSize: vars["--aui-space-12"],
  },

  // --- workspace tools card ---
  titleAccessoryButton: {
    gap: vars["--aui-space-8"],
  },

  // --- appearance/theme buttons ---
  appearanceGridButtons: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  modeButton: {
    blockSize: vars["--aui-control-height-lg"],
    inlineSize: "100%",
    justifyContent: "center",
  },

  // --- theme editor toolbar ---
  tokenToolbar: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    padding: vars["--aui-space-12"],
  },

  // --- theme preset card ---
  themeCard: {
    alignItems: {
      default: null,
      "@media (min-width: 640px)": "center",
    },
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-canvas-subtle"],
    },
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-accent"],
    },
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-16"],
    position: "relative",
    transitionProperty: "background-color, border-color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "1fr auto",
    },
  },
  themeCardActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    boxShadow: `0 0 0 1px ${vars["--aui-color-accent"]}`,
  },
  themeCardButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    display: "grid",
    gap: vars["--aui-space-8"],
    padding: 0,
    textAlign: "start",
  },
  themeCardName: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  microBadge: {
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  activeMark: {
    alignItems: "center",
    color: vars["--aui-color-accent"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-4"],
    marginInlineStart: {
      default: "auto",
      "@media (min-width: 640px)": 0,
    },
  },
  themeDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  themeAuthor: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "14px",
  },
  themeRightCol: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  swatchStrip: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
  },
  swatchDot: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    blockSize: vars["--aui-space-24"],
    inlineSize: vars["--aui-space-24"],
  },
  cardActionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
  },
  smallGhostButton: {
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-8"],
  },
  smallGhostButtonDanger: {
    color: vars["--aui-color-danger"],
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-8"],
  },

  // --- theme import ---
  importGrid: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  importHelp: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "18px",
  },
  code: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-micro"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-4"],
  },

  // --- theme token row ---
  tokenRow: {
    alignItems: {
      default: null,
      "@media (min-width: 1024px)": "center",
    },
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-16"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "190px 52px 1fr auto",
    },
  },
  tokenName: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  tokenPreset: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  tokenSwatch: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    blockSize: vars["--aui-control-height-xl"],
    inlineSize: 44,
  },

  // --- model selector triggers ---
  modelTrigger: {
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-canvas-subtle"],
    },
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    blockSize: vars["--aui-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--aui-space-12"],
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
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-canvas-subtle"],
    },
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    blockSize: vars["--aui-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--aui-space-12"],
    inlineSize: "100%",
  },
  fullWidth: {
    inlineSize: "100%",
  },
  // Free-form model id for ACP runtimes (Cursor, Kiro) that report their
  // catalog only once a session connects.
  modelIdInput: {
    blockSize: vars["--aui-control-height-lg"],
    inlineSize: "100%",
  },
  // One row per provider in Models: model grows, effort keeps a fixed column
  // and wraps under the model on narrow widths.
  modelEffortRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
  },
  modelEffortModel: {
    flexBasis: "14rem",
    flexGrow: 1,
    flexShrink: 1,
    minInlineSize: 0,
  },
  modelEffortEffort: {
    flexBasis: "9rem",
    flexGrow: 0,
    flexShrink: 0,
  },

  // --- auto routing block ---
  routingBlock: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    paddingBlockStart: vars["--aui-space-12"],
  },
  routingHeader: {
    alignItems: "start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  routingTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  accentGlyph: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  routingGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 768px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  smallTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },

  // --- skills roots/catalog ---
  metaLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  listCard: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  smallBadge: {
    blockSize: vars["--aui-space-20"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.04em",
    paddingInline: vars["--aui-space-8"],
    textTransform: "uppercase",
  },
  smallBadgePlain: {
    blockSize: vars["--aui-space-20"],
    fontSize: vars["--aui-font-size-micro"],
    paddingInline: vars["--aui-space-8"],
  },
  groupCard: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  groupToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderWidth: 0,
    cursor: "pointer",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "start",
    inlineSize: "100%",
  },
  groupToggleLeft: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  chevron: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  groupBody: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  skillMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // --- command palette / shortcut rows ---
  shortcutCard: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  shortcutRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
    },
  },
  shortcutLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    "@media (min-width: 1024px)": {
      flexShrink: 0,
      inlineSize: 256,
    },
  },
  shortcutLeadNarrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
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
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  seqRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  seqThen: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  selectTriggerPlain: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    blockSize: vars["--aui-control-height-lg"],
    inlineSize: "100%",
  },
  selectTriggerEffort: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    flex: 1,
    blockSize: vars["--aui-control-height-sm"],
    minInlineSize: 0,
  },
  selectContentTall: {
    maxBlockSize: 320,
  },
  selectContentEffortRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  effortLabel: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  captionMuted: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  microMuted: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  monoMicroMuted: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },

  // --- command visibility rows ---
  commandCard: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  commandRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    "@media (min-width: 1024px)": {
      alignItems: "start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  commandInfo: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  commandTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  mediumText: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  commandActions: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  paletteButtonsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  contributorCopy: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },

  // --- model shortcut option label ---
  modelOptionLabel: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  modelOptionGlyph: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },

  // --- prompt field reset ---
  promptTextarea: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    minBlockSize: 120,
    resize: "vertical",
  },
  promptFooter: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  promptState: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  promptStateCustom: {
    color: vars["--aui-color-accent"],
    fontSize: vars["--aui-font-size-caption"],
  },
  resetButton: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    blockSize: vars["--aui-control-height-xs"],
  },

  // --- lens session buttons ---
  clearButtonsGrid: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  clearButton: {
    gap: vars["--aui-space-8"],
    justifyContent: "flex-start",
  },

  // --- lens cdp hosts ---
  cdpLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  cdpInputRow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    "@media (min-width: 640px)": {
      flexDirection: "row",
    },
  },
  cdpAddButton: {
    gap: vars["--aui-space-8"],
    justifyContent: "center",
    "@media (min-width: 640px)": {
      inlineSize: "auto",
    },
  },
  cdpHelp: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  cdpHostList: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  cdpHostBadge: {
    borderRadius: vars["--aui-radius-mark"],
    gap: vars["--aui-space-4"],
    paddingInlineEnd: vars["--aui-space-4"],
  },
  cdpHostText: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    maxInlineSize: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
