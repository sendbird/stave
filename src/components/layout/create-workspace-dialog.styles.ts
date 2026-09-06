import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Mirrors the global `dropdown-in` keyframes the dialog previously borrowed. */
const dropdownIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-6px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

export const createWorkspaceStyles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: vars.space16,
    backgroundColor: vars.colorOverlay,
  },
  panel: {
    maxHeight: "calc(100dvh - 2rem)",
    width: "100%",
    maxWidth: "48rem",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: vars.space24,
    animationName: { default: dropdownIn, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "180ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
  headerRow: {
    marginBlockEnd: vars.space16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: 0,
    fontSize: vars.fontSizeTitle,
    fontWeight: vars.fontWeightSemibold,
  },
  closeIcon: {
    width: 16,
    height: 16,
  },
  lead: {
    marginBlock: 0,
    marginBlockEnd: vars.space16,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  field: {
    marginBlockEnd: vars.space16,
  },
  fieldLabel: {
    marginBlock: 0,
    marginBlockEnd: vars.space8,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  textInput: {
    height: 40,
    borderRadius: vars.radiusMark,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  fieldHint: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  modeList: {
    display: "grid",
    gap: vars.space8,
  },
  modeCard: {
    width: "100%",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    padding: vars.space12,
  },
  modeCardSelected: {
    borderColor: vars.colorAccent,
    backgroundColor: vars.colorSelectionFill,
  },
  modeCardIdle: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
  },
  modeTrigger: {
    width: "100%",
    textAlign: "left",
  },
  modeTitle: {
    marginBlock: 0,
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
  },
  modeTitlePlain: {
    marginBlock: 0,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
  },
  modeIcon: {
    width: 16,
    height: 16,
  },
  modeDescription: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  subBlock: {
    marginBlockStart: vars.space12,
  },
  subLabel: {
    marginBlock: 0,
    marginBlockEnd: vars.space8,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars.colorTextMuted,
  },
  pathRow: {
    display: "flex",
    gap: vars.space8,
  },
  pathInput: {
    height: 40,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    borderRadius: vars.radiusMark,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
  },
  browseButton: {
    height: 40,
  },
  section: {
    marginBlockStart: vars.space16,
  },
  sectionCopy: {
    marginBlock: 0,
    marginBlockEnd: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  initCommand: {
    minHeight: 110,
    borderRadius: vars.radiusMark,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
  },
  sectionHint: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  symlinkToggle: {
    width: "100%",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: vars.space16,
    paddingBlock: vars.space12,
    textAlign: "left",
  },
  symlinkToggleOn: {
    borderColor: vars.colorAccent,
    backgroundColor: {
      default: vars.colorSelectionFill,
      ":hover": vars.colorSelectionFill,
    },
  },
  symlinkToggleOff: {
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorBorderStrong,
    },
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorCanvas,
    },
  },
  symlinkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  symlinkTitle: {
    marginBlock: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  monoChip: {
    fontFamily: vars.fontMono,
  },
  monoChipInline: {
    fontFamily: vars.fontMono,
    verticalAlign: "middle",
  },
  statePill: {
    borderRadius: vars.radiusFull,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: vars.space8,
    paddingBlock: 2,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  statePillOn: {
    borderColor: vars.colorAccent,
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  statePillOff: {
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
  symlinkDescription: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  actions: {
    marginBlockStart: vars.space20,
    display: "flex",
    justifyContent: "flex-end",
    gap: vars.space8,
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars.space12,
    fontSize: vars.fontSizeBody,
    color: vars.colorDangerText,
  },
});
