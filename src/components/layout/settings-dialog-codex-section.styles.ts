import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const codexStyles = stylex.create({
  // ---- DenseMetric --------------------------------------------------------
  metric: {
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    borderColor: vars.colorBorderStrong,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  metricSuccess: {
    borderColor: vars.colorSuccessBorder,
    backgroundColor: vars.colorSuccessSoft,
  },
  metricWarning: {
    borderColor: vars.colorWarningBorder,
    backgroundColor: vars.colorWarningSoft,
  },
  metricMuted: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvasSubtle,
  },
  metricDefault: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  metricLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  metricValue: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.01em",
    marginTop: vars.space4,
  },

  // ---- DenseSection -------------------------------------------------------
  section: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  sectionHeader: {
    alignItems: "flex-start",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingInline: vars.space16,
    paddingBlock: vars.space12,
  },
  sectionHeaderText: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  sectionTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  sectionDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  sectionBody: {
    paddingInline: vars.space16,
    paddingBlock: vars.space16,
  },

  // ---- StatusPill (Badge className) --------------------------------------
  pill: {
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    paddingInline: "0.625rem",
    paddingBlock: "0.125rem",
  },
  pillDefault: {
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
  pillSuccess: {
    borderColor: vars.colorSuccessBorder,
    color: vars.colorSuccessText,
  },
  pillWarning: {
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  pillDanger: {
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },

  // ---- ReadOnlyCodeBlock (Textarea xstyle) -------------------------------
  codeBlock: {
    fontFamily: vars.fontMono,
    fontSize: "0.75rem",
    lineHeight: vars.lineHeightControl,
  },

  // ---- Root header panel --------------------------------------------------
  rootPanel: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusShell,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    overflow: "hidden",
  },
  rootHeader: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingInline: vars.space16,
    paddingBlock: "0.875rem",
  },
  rowWrapGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  headerMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
  },

  // ---- Tabs ---------------------------------------------------------------
  tabs: {
    gap: 0,
  },
  tabsBar: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingInline: vars.space16,
    paddingBlock: vars.space8,
  },
  tabsList: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: "auto",
    justifyContent: "flex-start",
    padding: vars.space4,
    width: "100%",
  },
  tabsTrigger: {
    borderRadius: vars.radiusPanel,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    height: 32,
    paddingInline: vars.space12,
  },
  tabContent: {
    margin: 0,
    padding: vars.space16,
  },

  // ---- Icon buttons / refresh --------------------------------------------
  refreshBtn: {
    gap: "0.375rem",
    height: 32,
  },
  ghostIconBtn: {
    height: 24,
    paddingInline: "0.375rem",
  },
  icon35: {
    height: "0.875rem",
    width: "0.875rem",
  },
  icon3: {
    height: 12,
    width: 12,
  },
  icon4: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  icon5: {
    height: vars.controlIconSizeLg,
    width: vars.controlIconSizeLg,
  },
  iconSpin: {
    animationName: spin,
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },

  // ---- Common layout helpers ---------------------------------------------
  stack4: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  stack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  stack1: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  stack15: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  mt2Stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  mt3Stack15: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: vars.space12,
  },
  mt3Stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    marginTop: vars.space12,
  },
  mt3Stack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    marginTop: vars.space12,
  },
  rowCenterBetween: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  rowCenterGap2: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  rowCenterGap15: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
  },
  rowWrapCenterBetween: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "space-between",
  },
  rowWrapCenterGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  rowWrapCenterGap3: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
  },
  metricsGrid: {
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 1280px)": "repeat(6, minmax(0, 1fr))",
    },
  },
  twoColGrid1: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
    },
  },
  twoColGrid1b: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
    },
  },
  twoColGridThreads: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 0.95fr) minmax(340px, 1.05fr)",
    },
  },
  twoColGridConfig: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1fr) minmax(340px, 0.95fr)",
    },
  },
  lgTwoCol: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  lgTwoColGap3: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  smTwoCol: {
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },

  // ---- Text roles ---------------------------------------------------------
  textSmMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  textSmMutedMt2: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space8,
  },
  textSmMutedMt1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space4,
  },
  textSmMutedMt3: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space12,
  },
  textSmMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  textSmSemibold: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  textXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  textXsMutedMt1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
  },
  textXsMutedMt3: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space12,
  },
  textXsDanger: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
  },
  textXsMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  textMicroMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  eyebrow: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  inspectorTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.01em",
  },
  inspectorTitleMt1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space4,
  },

  // ---- Card-like inner tiles ---------------------------------------------
  tile: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  tileBare: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  tileDanger: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  tileDashed: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingInline: vars.space12,
    paddingBlock: vars.space16,
  },
  tileDashedCentered: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingInline: vars.space12,
    paddingBlock: "2.5rem",
    textAlign: "center",
  },
  tileDashedCenteredSm: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingInline: vars.space12,
    paddingBlock: vars.space32,
    textAlign: "center",
  },
  innerTile: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },

  // ---- Accordion item -----------------------------------------------------
  accordionMulti: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    width: "100%",
  },
  accordionItem: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
  },
  accordionTrigger: {
    paddingBlock: vars.space12,
  },
  accordionContentStack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBottom: vars.space12,
  },
  accordionContentStack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingBottom: vars.space12,
  },

  // ---- Selectable row buttons (native button -> ADS Button host) ---------
  rowButton: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars.space8,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
    textAlign: "left",
    width: "100%",
    alignItems: {
      default: "stretch",
      "@media (min-width: 640px)": "flex-start",
    },
    justifyContent: {
      default: "flex-start",
      "@media (min-width: 640px)": "space-between",
    },
  },
  rowButtonThread: {
    alignItems: "flex-start",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
    textAlign: "left",
    width: "100%",
  },
  rowButtonResting: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
  },
  rowButtonSelected: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
  },
  rowButtonBody: {
    display: "flex",
    flexBasis: 0,
    flexDirection: "column",
    flexGrow: 1,
    gap: vars.space4,
    minWidth: 0,
  },
  rowButtonBodyNoGrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  rowSource: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
    "@media (min-width: 640px)": {
      maxWidth: "16rem",
      textAlign: "right",
    },
  },
  threadMeta: {
    alignItems: "flex-end",
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
  },

  // ---- Misc text/word wrap ------------------------------------------------
  minW0: { minWidth: 0 },
  minW0Flex1: { flexBasis: 0, flexGrow: 1, minWidth: 0 },
  minW0Grow1: { flexBasis: "0%", flexGrow: 1, flexShrink: 1, minWidth: 0 },
  breakWordsSmMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  breakWordsXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  breakAllXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    wordBreak: "break-all",
  },
  breakAllXsMutedMt1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
    wordBreak: "break-all",
  },
  breakAllMicroMutedMt1: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    marginTop: vars.space4,
    wordBreak: "break-all",
  },
  breakWordsXsFontMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  truncateSmMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  truncateXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mlSmMuted: {
    color: vars.colorTextMuted,
    marginLeft: "0.375rem",
  },

  // ---- Rate-limit progress bar -------------------------------------------
  progressTrack: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusFull,
    height: vars.space8,
  },
  progressFill: {
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    height: vars.space8,
  },

  // ---- Skill/chip rows ----------------------------------------------------
  chipWrapMt2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  chipWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },

  // ---- ExternalAnchor inline ----------------------------------------------
  anchorInline: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
  },

  // ---- Feature/hook rows --------------------------------------------------
  featureRow: {
    alignItems: "flex-start",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  shrink0WrapRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars.space8,
  },
  shrink0ColEnd: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars.space4,
  },

  // ---- Command search -----------------------------------------------------
  searchWrap: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: "260px",
    position: "relative",
  },
  searchIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    left: vars.space12,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: vars.controlIconSizeMd,
  },
  searchInput: {
    paddingLeft: "2.25rem",
  },

  // ---- Advanced config inputs --------------------------------------------
  configTextarea140: {
    fontFamily: vars.fontMono,
    fontSize: "0.75rem",
    minHeight: "140px",
  },
  configTextarea220: {
    fontFamily: vars.fontMono,
    fontSize: "0.75rem",
    minHeight: "220px",
  },
  rollbackInput: {
    height: vars.controlHeightLg,
  },
  maxWSm: {
    maxWidth: "24rem",
  },
  rollbackTile: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },

  // ---- Accordion trigger inner row ---------------------------------------
  accordionTriggerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    minWidth: 0,
    paddingRight: vars.space12,
    width: "100%",
  },
  accordionLayerName: {
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "left",
    wordBreak: "break-word",
  },
  descAnywhere: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },

  // ---- Exact-match convenience keys (1:1 with recurring class strings) ----
  py3: { paddingBlock: vars.space12 },
  space1: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  wFullSpace3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    width: "100%",
  },
  space2Pb3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBottom: vars.space12,
  },
  space3Pb3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingBottom: vars.space12,
  },
  rowColSmRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars.space8,
    alignItems: {
      default: "stretch",
      "@media (min-width: 640px)": "flex-start",
    },
    justifyContent: {
      default: "flex-start",
      "@media (min-width: 640px)": "space-between",
    },
  },
  bgTile40: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  roundedLgTile: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  minW0Flex1Only: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  mt2Chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  mt2Space2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  mr1: { marginRight: vars.space4 },
  mutedFg: { color: vars.colorTextMuted },
  rowCenterBetweenGap2: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
  },

  // ---- More exact-match convenience keys ----------------------------------
  mt2Space1SmMuted: {
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    gap: vars.space4,
    marginTop: vars.space8,
  },
  mt2Space1BreakAllSmMuted: {
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    gap: vars.space4,
    marginTop: vars.space8,
    wordBreak: "break-all",
  },
  space15: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  fontMediumFg: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  mlSmMutedFg: {
    color: vars.colorTextMuted,
    marginLeft: "0.375rem",
  },
  shrink0RowGap15: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.375rem",
  },
  metricStartRowXs: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    justifyContent: "space-between",
  },
  badgeTiny: {
    height: vars.space16,
    fontSize: "0.625rem",
    paddingInline: vars.space4,
  },
  breakWordsXsMuted2: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  inlineAnchorXs: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
  },
  mt3Space3: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    marginTop: vars.space12,
  },
  mt3Space15: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: vars.space12,
  },
  mt3Space2: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    marginTop: vars.space12,
  },
  mt3Space1XsDanger: {
    color: vars.colorDangerText,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    marginTop: vars.space12,
  },
  rateRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space12,
    justifyContent: "space-between",
  },
  tileDangerRow: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  minW0Space1: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  minW0Grow1Space1: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars.space4,
    minWidth: 0,
  },
  textXsDangerOnly: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
  },
  smallTile: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  minW0BreakSmMedium: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    minWidth: 0,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  mt1BreakXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  wrapGap2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  threadStatusMeta: {
    alignItems: "flex-end",
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
  },
  truncateMicroMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  emptyRoot: {
    backgroundColor: "transparent",
    borderStyle: "none",
    paddingInline: vars.space24,
    paddingBlock: vars.space64,
  },
  mt3TextSmDanger: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
    marginTop: vars.space12,
  },
  bgTile50: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  commandTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  mt1TextXsMuted: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
  },
  h8Only: { height: 32 },
  h7Only: { height: 28 },
  h7Xs: { fontSize: vars.fontSizeCaption, height: 28 },
  h6Px15: { height: 24, paddingInline: "0.375rem" },
  size3Icon: { height: 12, width: 12 },
  size35Icon: { height: "0.875rem", width: "0.875rem" },
  size5Icon: { height: vars.controlIconSizeLg, width: vars.controlIconSizeLg },
  mt3Space1XsDangerErr: {
    color: vars.colorDangerText,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    marginTop: vars.space12,
  },
  resourceRow: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 640px)": "center",
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars.space8,
    justifyContent: {
      default: "flex-start",
      "@media (min-width: 640px)": "space-between",
    },
    paddingInline: "0.625rem",
    paddingBlock: vars.space8,
  },
});
