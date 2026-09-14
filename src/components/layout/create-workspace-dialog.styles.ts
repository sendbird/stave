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
    padding: vars["--ads-space-16"],
    backgroundColor: vars["--ads-color-overlay"],
  },
  panel: {
    maxHeight: "calc(100dvh - 2rem)",
    width: "100%",
    maxWidth: "48rem",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: vars["--ads-space-24"],
    animationName: { default: dropdownIn, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "180ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
  headerRow: {
    marginBlockEnd: vars["--ads-space-16"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: 0,
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  closeIcon: {
    width: 16,
    height: 16,
  },
  lead: {
    marginBlock: 0,
    marginBlockEnd: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  field: {
    marginBlockEnd: vars["--ads-space-16"],
  },
  fieldLabel: {
    marginBlock: 0,
    marginBlockEnd: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  textInput: {
    height: 40,
    borderRadius: vars["--ads-radius-mark"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  fieldHint: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  modeList: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  modeCard: {
    width: "100%",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--ads-space-12"],
  },
  modeCardSelected: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-selection-fill"],
  },
  modeCardIdle: {
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  modeTrigger: {
    width: "100%",
    textAlign: "left",
  },
  modeTitle: {
    marginBlock: 0,
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  modeTitlePlain: {
    marginBlock: 0,
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  modeIcon: {
    width: 16,
    height: 16,
  },
  modeDescription: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  subBlock: {
    marginBlockStart: vars["--ads-space-12"],
  },
  subLabel: {
    marginBlock: 0,
    marginBlockEnd: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars["--ads-color-text-muted"],
  },
  pathRow: {
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  pathInput: {
    height: 40,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    borderRadius: vars["--ads-radius-mark"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
  },
  browseButton: {
    height: 40,
  },
  section: {
    marginBlockStart: vars["--ads-space-16"],
  },
  sectionCopy: {
    marginBlock: 0,
    marginBlockEnd: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  initCommand: {
    minHeight: 110,
    borderRadius: vars["--ads-radius-mark"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
  },
  sectionHint: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  symlinkToggle: {
    width: "100%",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
    textAlign: "left",
  },
  symlinkToggleOn: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: {
      default: vars["--ads-color-selection-fill"],
      ":hover": vars["--ads-color-selection-fill"],
    },
  },
  symlinkToggleOff: {
    borderColor: {
      default: vars["--ads-color-border"],
      ":hover": vars["--ads-color-border-strong"],
    },
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas"],
    },
  },
  symlinkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  symlinkTitle: {
    marginBlock: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  monoChip: {
    fontFamily: vars["--ads-font-mono"],
  },
  monoChipInline: {
    fontFamily: vars["--ads-font-mono"],
    verticalAlign: "middle",
  },
  statePill: {
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 2,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  statePillOn: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  statePillOff: {
    borderColor: vars["--ads-color-border"],
    color: vars["--ads-color-text-muted"],
  },
  symlinkDescription: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  actions: {
    marginBlockStart: vars["--ads-space-20"],
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--ads-space-8"],
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-danger-text"],
  },
});
