import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Chrome for the status-bar usage segment and its detail popover. */
export const statusBarUsageStyles = stylex.create({
  /** Vertical rhythm groups; replaces the former `space-y-*` stacks. */
  stackTight: { display: "flex", flexDirection: "column", gap: 6 },
  stackSnug: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  stack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },

  windowHead: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    minWidth: 0,
  },
  windowLabel: {
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Interface font with tabular figures, as in the strip: mono set the
  // `14% used · resets in 1h 7m` line wide enough to clip the window's name.
  windowValue: {
    color: vars["--ads-color-text-subtle"],
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  meterTrack: {
    backgroundColor: vars["--ads-color-overlay-pressed"],
    borderRadius: vars["--ads-radius-full"],
    height: 6,
    overflow: "hidden",
  },

  meterFill: { borderRadius: vars["--ads-radius-full"], height: "100%" },

  toneOk: { backgroundColor: vars["--ads-color-success"] },
  toneWarn: { backgroundColor: vars["--ads-color-warning"] },
  toneDanger: { backgroundColor: vars["--ads-color-danger"] },
  toneUnknown: { backgroundColor: vars["--ads-color-text-subtle"] },

  note: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  noteFaint: { color: vars["--ads-color-text-subtle"], fontSize: vars["--ads-font-size-micro"] },
  bucketTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  bucketPlan: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    marginInlineStart: vars["--ads-space-4"],
  },
  amountRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    justifyContent: "space-between",
  },
  amountLabel: { color: vars["--ads-color-text-muted"] },
  amountValue: { color: vars["--ads-color-text-subtle"], fontVariantNumeric: "tabular-nums" },

  trigger: {
    // Radius from the token, not `0`: this is a hoverable control, and a square
    // hover wash in a rounded chrome strip reads as a rendering artefact.
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    // `transparent`, never `null` — `null` unsets `background-color` and the
    // UA's `buttonface` shows through as an opaque grey slab (see
    // `right-rail.styles.ts`).
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
    height: 24,
    // The small Button's 32px floor would overhang the 28px bar.
    minHeight: 24,
    paddingInline: vars["--ads-space-8"],
  },
  triggerDot: {
    borderRadius: vars["--ads-radius-full"],
    display: "inline-block",
    height: 6,
    width: 6,
  },
  triggerMono: { fontFamily: vars["--ads-font-mono"] },
  clock: { color: vars["--ads-color-text-muted"], flexShrink: 0 },
  clockWedge: { fill: "currentColor", opacity: 0.45 },
  triggerWindow: { alignItems: "center", display: "inline-flex", gap: 3 },

  popover: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    gap: 0,
    overflow: "hidden",
    padding: 0,
    width: 304,
  },
  popoverHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  popoverTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  refreshButton: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    height: 28,
    padding: 0,
    width: 28,
  },
  refreshIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  refreshIconSpinning: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "linear",
  },
  popoverBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-12"],
  },
  pendingNote: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },
  limitNote: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  // Tokens and spend sit under their own hairline: they are a different kind
  // of number from the quota above, and they stay when the quota is unavailable.
  spendSection: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
  },
  // The meter's foot: the account switch and its settings link, set off from
  // the usage numbers by the same hairline the header uses. It hosts rows, so
  // it takes the popup row padding (4px) and the rows' own 8px inset lands
  // their text on the header's 12px edge.
  accountSection: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-4"],
  },
  accountRow: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    // Room for the check docked at the inline end.
    paddingInlineEnd: 32,
    position: "relative",
  },
  // The account's name over who it is signed in as. Grows to fill the row and
  // lets both lines truncate, so a long email never pushes the check off.
  accountLabelStack: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minInlineSize: 0,
  },
  accountIdentity: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    overflow: "hidden",
    paddingBlockEnd: vars["--ads-space-4"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountIdentityAttention: { color: vars["--ads-color-warning-text"] },
  accountMeta: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
  },
  accountHint: { fontWeight: vars["--ads-font-weight-regular"] },
  // A ghost Button laid out as the last menu row: full width, text on the
  // rows' 8px inset rather than centred.
  manageAccounts: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    justifyContent: "flex-start",
    paddingInline: vars["--ads-space-8"],
    width: "100%",
  },
});
