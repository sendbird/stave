import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/*
 * The Mission bar shares the Turn Activity header's geometry — 12px inline
 * padding, a 24px mark slot and a 10px gap — so the mission's line and the
 * turn's line start their text in the same column when they stack.
 */
const TUCK = "0.75rem";

export const missionBarStyles = stylex.create({
  /** Docked: a shelf that tucks under whatever sits below it. */
  tray: {
    position: "relative",
    zIndex: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    borderStartStartRadius: vars["--ads-radius-frame"],
    borderStartEndRadius: vars["--ads-radius-frame"],
    paddingBottom: `calc(${vars["--ads-space-8"]} + ${TUCK})`,
    marginBottom: `calc(-1 * ${TUCK})`,
  },
  /** Inside the composer frame the slot owns the final tuck. */
  trayFramed: {
    marginBottom: { default: `calc(-1 * ${TUCK})`, ":last-child": 0 },
  },
  /** The classic composer: the tray takes the shelf's inset itself. */
  trayStandalone: { marginInline: vars["--ads-space-12"] },
  /** In the Activity panel: a flat header above the turn. */
  flat: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBottom: vars["--ads-space-12"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-surface"],
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    minHeight: "2.5rem",
    paddingInline: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-4"],
    minWidth: 0,
  },
  mark: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    width: 24,
    height: 24,
  },
  markIcon: { width: 16, height: 16 },
  headline: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
  },
  headlineTitle: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  headlineDetail: { color: vars["--ads-color-text-muted"] },
  headlineState: { color: vars["--ads-color-text"] },
  headlineAttention: { color: vars["--ads-color-danger-text"] },
  headlineWaiting: { color: vars["--ads-color-warning-text"] },
  meta: {
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  metaWide: { display: { default: "inline", "@container (max-width: 26rem)": "none" } },
  actions: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: vars["--ads-space-2"] },
  /** The track starts under the headline text, not under the mark. */
  track: {
    paddingInlineStart: `calc(${vars["--ads-space-12"]} + 24px + 0.625rem)`,
    paddingInlineEnd: vars["--ads-space-12"],
    minWidth: 0,
  },
  sizer: { containerType: "inline-size", minWidth: 0 },
  quietButton: { color: vars["--ads-color-text-muted"] },
});
