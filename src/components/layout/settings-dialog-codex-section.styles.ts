import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const codexStyles = stylex.create({
  // ---- DenseMetric --------------------------------------------------------
  // A label over a value, no box: the section card around the group is the
  // only frame these facts need. Tone colors the value, not the tile, so a
  // healthy row reads as plain text.
  metric: {
    minWidth: 0,
  },
  metricLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
  },
  metricValue: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    marginBlockStart: vars["--ads-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metricValueSuccess: {
    color: vars["--ads-color-success-text"],
  },
  metricValueWarning: {
    color: vars["--ads-color-warning-text"],
  },
  metricValueMuted: {
    color: vars["--ads-color-text-muted"],
  },

  // ---- DenseSection -------------------------------------------------------
  section: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  sectionHeader: {
    alignItems: "start",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
  },
  sectionHeaderText: {
    flexBasis: 0,
    flexGrow: 1,
    minInlineSize: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  sectionTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  sectionDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  sectionBody: {
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-16"],
  },

  // ---- StatusPill (Badge className) --------------------------------------
  pill: {
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-2"],
  },
  pillDefault: {
    borderColor: vars["--ads-color-border"],
    color: vars["--ads-color-text-muted"],
  },
  pillSuccess: {
    borderColor: vars["--ads-color-success-border"],
    color: vars["--ads-color-success-text"],
  },
  pillWarning: {
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning-text"],
  },
  pillDanger: {
    borderColor: vars["--ads-color-danger-border"],
    color: vars["--ads-color-danger-text"],
  },

  // ---- ReadOnlyCodeBlock (Textarea xstyle) -------------------------------
  codeBlock: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },

  // ---- Root header panel --------------------------------------------------
  rootPanel: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-shell"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    overflow: "hidden",
  },
  rootHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
  },
  rowWrapGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  headerMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
  },

  // ---- Tabs ---------------------------------------------------------------
  tabs: {
    gap: vars["--ads-space-0"],
  },
  tabsBar: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-8"],
  },
  tabsList: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: "auto",
    justifyContent: "flex-start",
    padding: vars["--ads-space-4"],
    inlineSize: "100%",
  },
  // No radius override: a `pill` tab shares its box with the gliding
  // indicator, which is `radiusControl`. At `radiusPanel` the tab was a step
  // rounder than the pill that fills it, so the selected tab showed the
  // indicator's corners cutting inside its own.
  tabsTrigger: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    blockSize: vars["--ads-control-height-sm"],
    paddingInline: vars["--ads-space-12"],
  },
  tabContent: {
    margin: 0,
    padding: vars["--ads-space-16"],
  },

  // ---- Icon buttons / refresh --------------------------------------------
  refreshBtn: {
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-sm"],
  },
  ghostIconBtn: {
    blockSize: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-4"],
  },
  icon35: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  icon3: {
    blockSize: vars["--ads-space-12"],
    inlineSize: vars["--ads-space-12"],
  },
  icon4: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  icon5: {
    blockSize: vars["--ads-control-icon-size-lg"],
    inlineSize: vars["--ads-control-icon-size-lg"],
  },
  iconSpin: {
    animationName: spin,
    animationDuration: vars["--ads-motion-duration-loop"],
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
    gap: vars["--ads-space-16"],
  },
  stack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  stack1: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  stack15: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  mt2Stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-8"],
  },
  mt3Stack15: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-12"],
  },
  mt3Stack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-12"],
  },
  mt3Stack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginBlockStart: vars["--ads-space-12"],
  },
  rowCenterBetween: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  rowCenterGap2: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  rowCenterGap15: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  rowWrapCenterBetween: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  rowWrapCenterGap2: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  rowWrapCenterGap3: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
  },
  metricsGrid: {
    columnGap: vars["--ads-space-16"],
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
      "@media (min-width: 1280px)": "repeat(6, minmax(0, 1fr))",
    },
    rowGap: vars["--ads-space-12"],
  },
  twoColGrid1: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
    },
  },
  twoColGrid1b: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
    },
  },
  twoColGridThreads: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 0.95fr) minmax(340px, 1.05fr)",
    },
  },
  twoColGridConfig: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)":
        "minmax(0, 1fr) minmax(340px, 0.95fr)",
    },
  },
  lgTwoCol: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  lgTwoColGap3: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  smTwoCol: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },

  // ---- Text roles ---------------------------------------------------------
  textSmMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  textSmMutedMt2: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-8"],
  },
  textSmMutedMt1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
  },
  textSmMutedMt3: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-12"],
  },
  textSmMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  textSmSemibold: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  textXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  textXsMutedMt1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
  },
  textXsMutedMt3: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-12"],
  },
  textXsDanger: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
  },
  textXsMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  textMicroMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  eyebrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  inspectorTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.01em",
  },
  inspectorTitleMt1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
  },

  // ---- Card-like inner tiles ---------------------------------------------
  tile: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  tileBare: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  tileDanger: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  tileDashed: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-16"],
  },
  tileDashedCentered: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-40"],
    textAlign: "center",
  },
  tileDashedCenteredSm: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-32"],
    textAlign: "center",
  },
  innerTile: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },

  // ---- Accordion item -----------------------------------------------------
  accordionMulti: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  accordionItem: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
  },
  accordionTrigger: {
    paddingBlock: vars["--ads-space-12"],
  },
  accordionContentStack2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlockEnd: vars["--ads-space-12"],
  },
  accordionContentStack3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlockEnd: vars["--ads-space-12"],
  },

  // ---- Selectable row buttons (native button -> ADS Button host) ---------
  rowButton: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    textAlign: "left",
    inlineSize: "100%",
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
    alignItems: "start",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    textAlign: "left",
    inlineSize: "100%",
  },
  rowButtonResting: {
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  rowButtonSelected: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
  },
  rowButtonBody: {
    display: "flex",
    flexBasis: 0,
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  rowButtonBodyNoGrow: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  rowSource: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
    "@media (min-width: 640px)": {
      maxInlineSize: "16rem",
      textAlign: "right",
    },
  },
  threadMeta: {
    alignItems: "flex-end",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
  },

  // ---- Misc text/word wrap ------------------------------------------------
  minW0: { minInlineSize: 0 },
  minW0Flex1: { flexBasis: 0, flexGrow: 1, minInlineSize: 0 },
  minW0Grow1: { flexBasis: "0%", flexGrow: 1, flexShrink: 1, minInlineSize: 0 },
  breakWordsSmMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  breakWordsXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  breakAllXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    wordBreak: "break-all",
  },
  breakAllXsMutedMt1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
    wordBreak: "break-all",
  },
  breakAllMicroMutedMt1: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    marginBlockStart: vars["--ads-space-4"],
    wordBreak: "break-all",
  },
  breakWordsXsFontMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  truncateSmMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  truncateXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mlSmMuted: {
    color: vars["--ads-color-text-muted"],
    marginInlineStart: vars["--ads-space-4"],
  },

  // ---- Rate-limit progress bar -------------------------------------------
  progressTrack: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-full"],
    blockSize: vars["--ads-space-8"],
  },
  progressFill: {
    borderRadius: vars["--ads-radius-full"],
    blockSize: vars["--ads-space-8"],
  },
  // Same ramp as the status bar usage meter: a rate limit has a real
  // denominator, so the bar is a reading, not an accent.
  progressFillOk: { backgroundColor: vars["--ads-color-success"] },
  progressFillWarn: { backgroundColor: vars["--ads-color-warning"] },
  progressFillDanger: { backgroundColor: vars["--ads-color-danger"] },

  // ---- Skill/chip rows ----------------------------------------------------
  chipWrapMt2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-8"],
  },
  chipWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },

  // ---- ExternalAnchor inline ----------------------------------------------
  anchorInline: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
  },

  // ---- Feature/hook rows --------------------------------------------------
  featureRow: {
    alignItems: "start",
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  shrink0WrapRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  shrink0ColEnd: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },

  // ---- Command search -----------------------------------------------------
  searchWrap: {
    flexBasis: 0,
    flexGrow: 1,
    minInlineSize: "16rem",
    position: "relative",
  },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    left: vars["--ads-space-12"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  searchInput: {
    paddingInlineStart: vars["--ads-space-32"],
  },

  // ---- Advanced config inputs --------------------------------------------
  configTextarea140: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: "8.75rem",
  },
  configTextarea220: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: "13.75rem",
  },
  rollbackInput: {
    blockSize: vars["--ads-control-height-lg"],
  },
  maxWSm: {
    maxInlineSize: "24rem",
  },
  rollbackTile: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },

  // ---- Accordion trigger inner row ---------------------------------------
  accordionTriggerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
    paddingInlineEnd: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  accordionLayerName: {
    minInlineSize: 0,
    overflowWrap: "anywhere",
    textAlign: "left",
    wordBreak: "break-word",
  },
  descAnywhere: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },

  // ---- Exact-match convenience keys (1:1 with recurring class strings) ----
  py3: { paddingBlock: vars["--ads-space-12"] },
  space1: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  wFullSpace3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  space2Pb3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlockEnd: vars["--ads-space-12"],
  },
  space3Pb3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlockEnd: vars["--ads-space-12"],
  },
  rowColSmRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--ads-space-8"],
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
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  roundedLgTile: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  minW0Flex1Only: {
    flexBasis: 0,
    flexGrow: 1,
    minInlineSize: 0,
  },
  mt2Chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-8"],
  },
  mt2Space2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-8"],
  },
  mr1: { marginInlineEnd: vars["--ads-space-4"] },
  mutedFg: { color: vars["--ads-color-text-muted"] },
  rowCenterBetweenGap2: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },

  // ---- More exact-match convenience keys ----------------------------------
  mt2Space1SmMuted: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-4"],
    marginBlockStart: vars["--ads-space-8"],
  },
  mt2Space1BreakAllSmMuted: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-4"],
    marginBlockStart: vars["--ads-space-8"],
    wordBreak: "break-all",
  },
  space15: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  fontMediumFg: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  mlSmMutedFg: {
    color: vars["--ads-color-text-muted"],
    marginInlineStart: vars["--ads-space-4"],
  },
  shrink0RowGap15: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
  },
  metricStartRowXs: {
    alignItems: "start",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  badgeTiny: {
    blockSize: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-micro"],
    paddingInline: vars["--ads-space-4"],
  },
  breakWordsXsMuted2: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  inlineAnchorXs: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
  },
  mt3Space3: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginBlockStart: vars["--ads-space-12"],
  },
  mt3Space15: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-12"],
  },
  mt3Space2: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-12"],
  },
  mt3Space1XsDanger: {
    color: vars["--ads-color-danger-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    marginBlockStart: vars["--ads-space-12"],
  },
  rateRow: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  tileDangerRow: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  minW0Space1: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  minW0Grow1Space1: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  textXsDangerOnly: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
  },
  smallTile: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  minW0BreakSmMedium: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minInlineSize: 0,
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  mt1BreakXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  wrapGap2: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  threadStatusMeta: {
    alignItems: "flex-end",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
  },
  truncateMicroMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  emptyRoot: {
    backgroundColor: "transparent",
    borderStyle: "none",
    paddingInline: vars["--ads-space-24"],
    paddingBlock: vars["--ads-space-64"],
  },
  mt3TextSmDanger: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-12"],
  },
  bgTile50: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  commandTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  mt1TextXsMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
  },
  h8Only: { height: 32 },
  h7Only: { height: 28 },
  h7Xs: { fontSize: vars["--ads-font-size-caption"], height: 28 },
  h6Px15: { height: 24, paddingInline: "0.375rem" },
  size3Icon: { height: 12, width: 12 },
  size35Icon: { height: "0.875rem", width: "0.875rem" },
  size5Icon: { height: vars["--ads-control-icon-size-lg"], width: vars["--ads-control-icon-size-lg"] },
  mt3Space1XsDangerErr: {
    color: vars["--ads-color-danger-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    marginBlockStart: vars["--ads-space-12"],
  },
  resourceRow: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 640px)": "center",
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--ads-space-8"],
    justifyContent: {
      default: "flex-start",
      "@media (min-width: 640px)": "space-between",
    },
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
  },
});
