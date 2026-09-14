import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const rowActionsOpacity = "--queued-row-actions-opacity";

export const queuedTurnsStyles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: vars["--ads-color-surface"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
    // In-surface panel, not a popup: the queue renders in the composer's own
    // flow above the input, with no portal, backdrop or anchor. `elevationRaised`
    // is the step for a raised in-flow panel; `elevationOverlay` is the
    // dialog/popover band and made a stationary panel read as a floating popup.
    boxShadow: vars["--ads-elevation-raised"],
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  badge: {
    height: 20,
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeCount: {
    height: 20,
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
  },
  caption: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  clearButton: {
    marginLeft: "auto",
    height: 28,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    position: "relative",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
      ":hover": vars["--ads-color-border"],
    },
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 80%, transparent)`,
    paddingInline: 10,
    paddingBlock: vars["--ads-space-8"],
    // A row is content inside the panel above, so it claims no depth of its
    // own — nesting `elevationRaised`/`elevationLift` here matched and then
    // out-stepped its own container. Hover reads on the border instead.
    boxShadow: vars["--ads-elevation-flat"],
    transitionProperty: "border-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    [rowActionsOpacity]: { default: 0, ":hover": 1, ":focus-within": 1 },
  },
  rowFirst: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 30%, transparent)`,
  },
  editArea: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  editTextarea: {
    minHeight: 80,
    resize: "vertical",
    fontSize: vars["--ads-font-size-body"],
  },
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--ads-space-8"],
  },
  rowBody: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  indexBadge: {
    marginTop: vars["--ads-space-2"],
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-surface-tint"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  rowContent: {
    minWidth: 0,
    flex: 1,
  },
  summary: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  dispatch: {
    marginTop: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  dispatchWarning: { color: vars["--ads-color-warning-text"] },
  dispatchFirst: {
    color: `color-mix(in oklch, ${vars["--ads-color-accent"]} 80%, transparent)`,
  },
  dispatchMuted: { color: vars["--ads-color-text-muted"] },
  actions: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-2"],
    opacity: `var(${rowActionsOpacity})`,
    transitionProperty: "opacity",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  actionAccent: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-accent"] },
  },
  actionDanger: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-danger"] },
  },
  actionIcon: { width: "0.875rem", height: "0.875rem" },
});
