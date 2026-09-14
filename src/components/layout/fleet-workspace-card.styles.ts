import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** The status word next to a task's glyph only fits once the board is wide. */
const WIDE = "@media (min-width: 40rem)";

export const cardStyles = stylex.create({
  card: {
    backgroundColor: {
      default: vars["--ads-color-surface"],
      ":hover": vars["--ads-color-surface-raised"],
    },
    borderColor: {
      default: vars["--ads-color-border-subtle"],
      ":hover": vars["--ads-color-border"],
    },
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    // The activity rail: a 2px cap along the card's top edge, tinted by the
    // `accent*` styles below.
    "::before": {
      content: '""',
      height: 2,
      insetInlineEnd: 0,
      insetInlineStart: 0,
      position: "absolute",
      top: 0,
    },
  },
  accentLive: {
    "::before": { backgroundColor: vars["--ads-color-accent"] },
  },
  accentBlocking: {
    "::before": { backgroundColor: vars["--ads-color-warning"] },
  },
  accentDormant: {
    "::before": { backgroundColor: vars["--ads-color-border"] },
  },
  accentQuiet: {
    "::before": { backgroundColor: vars["--ads-color-border-subtle"] },
  },
  cardDormant: {
    opacity: {
      default: 0.7,
      ":hover": 1,
    },
  },
  cardExpanded: {
    boxShadow: `0 0 0 1px ${vars["--ads-color-border-focus"]}`,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBottom: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingTop: 10,
  },
  headerMain: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  name: {
    color: vars["--ads-color-text"],
    // Was a bare `13`, between Caption (12) and Body (14). Row titles are Body
    // medium across the fleet surfaces.
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Badges state a fact about the card; they never take the row's width. */
  chip: {
    flexShrink: 0,
    minWidth: 0,
  },
  dormantMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  dormantIcon: {
    color: vars["--ads-color-text-muted"],
    height: 12,
    width: 12,
  },
  metaRow: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    marginTop: vars["--ads-space-2"],
    minWidth: 0,
  },
  metaPart: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaIcon: {
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  tasks: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    minWidth: 0,
  },
  tasksEmpty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  list: {
    minWidth: 0,
  },
  listItem: {
    minWidth: 0,
  },
  taskRow: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    display: "flex",
    gap: vars["--ads-space-8"],
    minHeight: 36,
    minWidth: 0,
    paddingBlock: 6,
    paddingInlineEnd: vars["--ads-space-12"],
    paddingInlineStart: vars["--ads-space-16"],
    position: "relative",
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars["--ads-z-index-panel"],
    },
    // Per-task status rail, tinted by the `rail*` styles below.
    "::before": {
      borderRadius: vars["--ads-radius-full"],
      bottom: 6,
      content: '""',
      insetInlineStart: 6,
      position: "absolute",
      top: 6,
      width: 2,
    },
  },
  taskRowExpanded: {
    backgroundColor: vars["--ads-color-selection-fill"],
  },
  railWarning: {
    "::before": { backgroundColor: vars["--ads-color-warning"] },
  },
  railDanger: {
    "::before": { backgroundColor: vars["--ads-color-danger"] },
  },
  railAccent: {
    "::before": { backgroundColor: vars["--ads-color-accent"] },
  },
  railNeutral: {
    "::before": { backgroundColor: vars["--ads-color-border"] },
  },
  railUnknown: {
    "::before": { backgroundColor: vars["--ads-color-border-subtle"] },
  },
  providerMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  providerIcon: {
    height: 12,
    width: 12,
  },
  // The card's row title, so it takes the row-title step rather than the
  // metadata step used by the status and timestamp beside it.
  taskTitle: {
    color: vars["--ads-color-text"],
    flexBasis: 0,
    flexGrow: 1,
    fontSize: vars["--ads-font-size-body"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  taskStatus: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
  },
  statusIcon: {
    height: 12,
    width: 12,
  },
  statusLabel: {
    display: {
      default: "none",
      [WIDE]: "inline",
    },
  },
  toneWarning: {
    color: vars["--ads-color-warning-text"],
  },
  toneDanger: {
    color: vars["--ads-color-danger-text"],
  },
  toneAccent: {
    color: vars["--ads-color-accent"],
  },
  toneMuted: {
    color: vars["--ads-color-text-muted"],
  },
  disclosure: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "left",
    width: "100%",
  },
  controls: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  footer: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    marginTop: "auto",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
  },
  todo: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  todoTrack: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-full"],
    height: 4,
    overflow: "hidden",
    width: 40,
  },
  todoFill: {
    backgroundColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-full"],
    display: "block",
    height: "100%",
  },
  todoCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  activity: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openAction: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    height: 24,
    marginInlineStart: "auto",
    paddingInline: vars["--ads-space-8"],
  },
  openIcon: {
    height: 12,
    width: 12,
  },
});
