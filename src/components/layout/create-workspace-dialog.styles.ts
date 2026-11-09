import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    padding: vars["--aui-space-16"],
    backgroundColor: vars["--aui-color-overlay"],
  },
  panel: {
    maxHeight: "calc(100dvh - 2rem)",
    width: "100%",
    maxWidth: "48rem",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: vars["--aui-space-24"],
    animationName: { default: dropdownIn, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "180ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
  headerRow: {
    marginBlockEnd: vars["--aui-space-16"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: 0,
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  closeIcon: {
    width: 16,
    height: 16,
  },
  lead: {
    marginBlock: 0,
    marginBlockEnd: vars["--aui-space-16"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  field: {
    marginBlockEnd: vars["--aui-space-16"],
  },
  fieldLabel: {
    marginBlock: 0,
    marginBlockEnd: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  textInput: {
    height: 40,
    borderRadius: vars["--aui-radius-mark"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  fieldHint: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  modeList: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  modeCard: {
    width: "100%",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--aui-space-12"],
  },
  modeCardSelected: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-selection-fill"],
  },
  modeCardIdle: {
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
  },
  modeTrigger: {
    width: "100%",
    textAlign: "left",
  },
  modeTitle: {
    marginBlock: 0,
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  modeTitlePlain: {
    marginBlock: 0,
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  modeIcon: {
    width: 16,
    height: 16,
  },
  modeDescription: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  subBlock: {
    marginBlockStart: vars["--aui-space-12"],
  },
  subLabel: {
    marginBlock: 0,
    marginBlockEnd: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars["--aui-color-text-muted"],
  },
  pathRow: {
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  pathInput: {
    height: 40,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    borderRadius: vars["--aui-radius-mark"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
  },
  browseButton: {
    height: 40,
  },
  section: {
    marginBlockStart: vars["--aui-space-16"],
  },
  sectionCopy: {
    marginBlock: 0,
    marginBlockEnd: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  initCommand: {
    minHeight: 110,
    borderRadius: vars["--aui-radius-mark"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
  },
  sectionHint: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  symlinkToggle: {
    width: "100%",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    textAlign: "left",
  },
  symlinkToggleOn: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: {
      default: vars["--aui-color-selection-fill"],
      ":hover": vars["--aui-color-selection-fill"],
    },
  },
  symlinkToggleOff: {
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-border-strong"],
    },
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-canvas"],
    },
  },
  symlinkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  symlinkTitle: {
    marginBlock: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  monoChip: {
    fontFamily: vars["--aui-font-mono"],
  },
  monoChipInline: {
    fontFamily: vars["--aui-font-mono"],
    verticalAlign: "middle",
  },
  statePill: {
    borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 2,
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  statePillOn: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-accent-soft"],
    color: vars["--aui-color-accent"],
  },
  statePillOff: {
    borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text-muted"],
  },
  symlinkDescription: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  actions: {
    marginBlockStart: vars["--aui-space-20"],
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--aui-space-8"],
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-danger-text"],
  },
});
