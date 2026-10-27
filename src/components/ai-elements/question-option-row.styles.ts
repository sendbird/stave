import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/**
 * The answer rows every question surface shares: the answering panel, a
 * delegated task's request slot, the read-only record and the transcript.
 *
 * Every mark in a row (the leading control, the trailing key) sits in a box as
 * tall as the label's first line, so they stay on that line however far the
 * label or its description wraps.
 */
export const questionOptionRowStyles = stylex.create({
  list: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 90%, transparent)`,
  },
  row: {
    position: "relative",
    display: "flex",
    minWidth: 0,
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--ads-space-12"],
    // Rows nobody picked step back so the picked one reads first.
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    },
    paddingInline: vars["--ads-space-12"],
    paddingBlock: "0.625rem",
    transitionProperty: "background-color, color",
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  rowDivided: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
  },
  // The list clips its rows to the rounded corners, so the keyboard ring is
  // drawn inside each row instead of outside it.
  rowFocusInset: {
    outlineOffset: {
      default: 0,
      ":has(:focus-visible)": `calc(-1 * (${vars["--ads-focus-ring-offset"]} + ${vars["--ads-focus-ring-width"]}))`,
    },
  },
  rowSelected: {
    color: {
      default: vars["--ads-color-text"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-accent"]} 7%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
    },
  },
  rowDisabled: {
    pointerEvents: "none",
    cursor: "not-allowed",
    opacity: 0.45,
  },
  rowReadOnly: { pointerEvents: "none", cursor: "default" },
  // A text row takes its whole line and is clicked to type, not to pick.
  rowText: {
    alignItems: "center",
    cursor: "text",
  },

  // ── Leading control ──────────────────────────────────────────
  markSlot: {
    display: "flex",
    width: 20,
    height: vars["--ads-line-height-control"],
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  radio: {
    display: "flex",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-strong"],
    backgroundColor: vars["--ads-color-surface-raised"],
  },
  radioChecked: { borderColor: vars["--ads-color-accent"] },
  radioDot: {
    display: "block",
    width: 8,
    height: 8,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-accent"],
  },
  checkbox: {
    display: "flex",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-strong"],
    backgroundColor: vars["--ads-color-surface-raised"],
    color: vars["--ads-color-accent-text"],
  },
  checkboxChecked: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-accent"],
  },
  checkIcon: { width: 12, height: 12 },
  textIcon: { width: 14, height: 14 },

  // ── Body ─────────────────────────────────────────────────────
  body: { minWidth: 0, flex: 1 },
  labelRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
  },
  label: {
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-control"],
  },
  recommendedBadge: {
    height: 16,
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
  },
  description: {
    marginTop: vars["--ads-space-2"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "18px",
    color: vars["--ads-color-text-muted"],
  },

  // ── Trailing key ─────────────────────────────────────────────
  // The small keycap is exactly one label line tall.
  shortcut: { alignSelf: "flex-start" },
  shortcutCentered: { alignSelf: "center" },

  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
