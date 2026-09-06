import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** The status word next to a task's glyph only fits once the board is wide. */
const WIDE = "@media (min-width: 40rem)";

export const cardStyles = stylex.create({
  card: {
    backgroundColor: {
      default: vars.colorSurface,
      ":hover": vars.colorSurfaceRaised,
    },
    borderColor: {
      default: vars.colorBorderSubtle,
      ":hover": vars.colorBorder,
    },
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
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
    "::before": { backgroundColor: vars.colorAccent },
  },
  accentBlocking: {
    "::before": { backgroundColor: vars.colorWarning },
  },
  accentDormant: {
    "::before": { backgroundColor: vars.colorBorder },
  },
  accentQuiet: {
    "::before": { backgroundColor: vars.colorBorderSubtle },
  },
  cardDormant: {
    opacity: {
      default: 0.7,
      ":hover": 1,
    },
  },
  cardExpanded: {
    boxShadow: `0 0 0 1px ${vars.colorBorderFocus}`,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
    paddingBottom: vars.space8,
    paddingInline: vars.space12,
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
    color: vars.colorText,
    fontSize: 13,
    fontWeight: vars.fontWeightSemibold,
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
    color: vars.colorTextMuted,
    height: 12,
    width: 12,
  },
  metaRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
    marginTop: vars.space2,
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
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    minWidth: 0,
  },
  tasksEmpty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
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
      ":hover": vars.colorOverlayHover,
    },
    display: "flex",
    gap: vars.space8,
    minHeight: 36,
    minWidth: 0,
    paddingBlock: 6,
    paddingInlineEnd: vars.space12,
    paddingInlineStart: vars.space16,
    position: "relative",
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars.zIndexPanel,
    },
    // Per-task status rail, tinted by the `rail*` styles below.
    "::before": {
      borderRadius: vars.radiusFull,
      bottom: 6,
      content: '""',
      insetInlineStart: 6,
      position: "absolute",
      top: 6,
      width: 2,
    },
  },
  taskRowExpanded: {
    backgroundColor: vars.colorSelectionFill,
  },
  railWarning: {
    "::before": { backgroundColor: vars.colorWarning },
  },
  railDanger: {
    "::before": { backgroundColor: vars.colorDanger },
  },
  railAccent: {
    "::before": { backgroundColor: vars.colorAccent },
  },
  railNeutral: {
    "::before": { backgroundColor: vars.colorBorder },
  },
  railUnknown: {
    "::before": { backgroundColor: vars.colorBorderSubtle },
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
  taskTitle: {
    color: vars.colorText,
    flexBasis: 0,
    flexGrow: 1,
    fontSize: vars.fontSizeCaption,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  taskStatus: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
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
    color: vars.colorWarningText,
  },
  toneDanger: {
    color: vars.colorDangerText,
  },
  toneAccent: {
    color: vars.colorAccent,
  },
  toneMuted: {
    color: vars.colorTextMuted,
  },
  disclosure: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    paddingBlock: vars.space4,
    paddingInline: vars.space16,
    textAlign: "left",
    width: "100%",
  },
  controls: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  footer: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    marginTop: "auto",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars.space12,
  },
  todo: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  todoTrack: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusFull,
    height: 4,
    overflow: "hidden",
    width: 40,
  },
  todoFill: {
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    display: "block",
    height: "100%",
  },
  todoCount: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
  },
  activity: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openAction: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    height: 24,
    marginInlineStart: "auto",
    paddingInline: vars.space8,
  },
  openIcon: {
    height: 12,
    width: 12,
  },
});
