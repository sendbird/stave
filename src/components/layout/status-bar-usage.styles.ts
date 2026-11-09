import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Chrome for the status-bar usage segment and its detail popover. */
export const statusBarUsageStyles = stylex.create({
  /** Vertical rhythm groups; replaces the former `space-y-*` stacks. */
  stackTight: { display: "flex", flexDirection: "column", gap: 6 },
  stackSnug: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  stack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },

  windowHead: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    minWidth: 0,
  },
  windowLabel: {
    color: vars["--aui-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Interface font with tabular figures, as in the strip: mono set the
  // `14% used · resets in 1h 7m` line wide enough to clip the window's name.
  windowValue: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  toneOk: { backgroundColor: vars["--aui-color-success"] },
  toneWarn: { backgroundColor: vars["--aui-color-warning"] },
  toneDanger: { backgroundColor: vars["--aui-color-danger"] },
  toneUnknown: { backgroundColor: vars["--aui-color-text-subtle"] },

  note: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  noteFaint: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  bucketTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  bucketPlan: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    marginInlineStart: vars["--aui-space-4"],
  },
  amountRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    justifyContent: "space-between",
  },
  amountLabel: { color: vars["--aui-color-text-muted"] },
  amountValue: { color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums" },

  trigger: {
    // Radius from the token, not `0`: this is a hoverable control, and a square
    // hover wash in a rounded chrome strip reads as a rendering artefact.
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    // `transparent`, never `null` — `null` unsets `background-color` and the
    // UA's `buttonface` shows through as an opaque grey slab (see
    // `right-rail.styles.ts`).
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
    height: 24,
    // The small Button's 32px floor would overhang the 28px bar.
    minHeight: 24,
    paddingInline: vars["--aui-space-8"],
  },
  triggerDot: {
    borderRadius: vars["--aui-radius-full"],
    display: "inline-block",
    height: 6,
    width: 6,
  },
  triggerMono: { fontFamily: vars["--aui-font-mono"] },
  clock: { color: vars["--aui-color-text-muted"], flexShrink: 0 },
  clockWedge: { fill: "currentColor", opacity: 0.45 },
  triggerWindow: { alignItems: "center", display: "inline-flex", gap: 3 },

  popover: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    gap: 0,
    overflow: "hidden",
    padding: 0,
    width: 304,
  },
  popoverHeader: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars["--aui-space-12"],
  },
  popoverTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  refreshButton: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    height: 28,
    padding: 0,
    width: 28,
  },
  refreshIcon: { height: vars["--aui-control-icon-size-sm"], width: vars["--aui-control-icon-size-sm"] },
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
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  pendingNote: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },
  limitNote: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  // Tokens and spend sit under their own hairline: they are a different kind
  // of number from the quota above, and they stay when the quota is unavailable.
  spendSection: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
  },
  // The meter's foot: the account switch and its settings link, set off from
  // the usage numbers by the same hairline the header uses. It hosts rows, so
  // it takes the popup row padding (4px) and the rows' own 8px inset lands
  // their text on the header's 12px edge.
  accountSection: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-4"],
  },
  accountRow: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
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
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    overflow: "hidden",
    paddingBlockEnd: vars["--aui-space-4"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountIdentityAttention: { color: vars["--aui-color-warning-text"] },
  accountMeta: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
  },
  accountHint: { fontWeight: vars["--aui-font-weight-regular"] },
  // A ghost Button laid out as the last menu row: full width, text on the
  // rows' 8px inset rather than centred.
  manageAccounts: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    justifyContent: "flex-start",
    paddingInline: vars["--aui-space-8"],
    width: "100%",
  },
});
