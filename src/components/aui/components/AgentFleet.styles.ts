import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Wide enough for the list and a readable tree side by side: a 16rem list,
 * the gap and a 26rem tree. Below it the tree opens under its card instead.
 * A container query, so the layout follows the space the fleet is given,
 * not the window (Fleet sits between two sidebars).
 */
const WIDE = "@container aui-agent-fleet (min-width: 44rem)";

/**
 * Two fixed heights per card, one for two lines and one for three: a status
 * change swaps words and glyphs inside the card, and a card only changes
 * height when its numbers line comes or goes, by one known step. Each line is
 * one line tall and clips.
 */
const MAIN_CARD_HEIGHT_FULL = "6.25rem";
const MAIN_CARD_HEIGHT_COMPACT = "5rem";
const SUB_CARD_HEIGHT_FULL = "4.75rem";
const SUB_CARD_HEIGHT_COMPACT = "3.5rem";
/** Where a subagent card's middle sits inside its tree row (row padding + half a card). */
const subCardMiddle = (height: string) => `calc(${vars["--aui-space-4"]} + ${height} / 2)`;

/**
 * The open tree stops at a reading width on a wide fleet: about seventy
 * characters of the cards' caption text, plus the connector column, the
 * status and a shortcut. The space past it stays empty.
 */
const TREE_MAX_WIDTH = "42rem";

export const agentFleetStyles = stylex.create({
  root: {
    containerName: "aui-agent-fleet",
    containerType: "inline-size",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  topBar: {
    alignItems: "baseline",
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: vars["--aui-space-4"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
  },
  totals: {
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    margin: 0,
    rowGap: vars["--aui-space-2"],
  },
  totalsAttention: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  body: {
    alignItems: "start",
    columnGap: vars["--aui-space-16"],
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [WIDE]: `minmax(16rem, 22rem) minmax(0, ${TREE_MAX_WIDTH})`,
    },
    // Columns at their caps leave the rest of a wide row empty, at its end.
    justifyContent: "start",
    // One row per main card, then a flexible row: the tree spans them all, and
    // a tree taller than the list grows the last row, not the card rows.
    // `--agent-fleet-rows` is the card count, written inline by the component.
    gridTemplateRows: {
      default: "none",
      [WIDE]: "repeat(var(--agent-fleet-rows, 1), auto) minmax(0, 1fr)",
    },
    margin: 0,
    minInlineSize: 0,
    padding: 0,
    rowGap: vars["--aui-space-8"],
  },
  // The list item adds no box: its card and tree are the grid's own items.
  item: {
    display: "contents",
  },
  card: {
    backgroundColor: {
      default: vars["--aui-color-surface"],
      ":hover": vars["--aui-color-surface-raised"],
    },
    borderColor: {
      default: vars["--aui-color-border-subtle"],
      ":hover": vars["--aui-color-border"],
    },
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    color: vars["--aui-color-text"],
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    gridColumn: "1",
    inlineSize: "100%",
    justifyContent: "center",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "start",
  },
  cardFull: {
    blockSize: MAIN_CARD_HEIGHT_FULL,
  },
  cardCompact: {
    blockSize: MAIN_CARD_HEIGHT_COMPACT,
  },
  cardOpen: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border-focus"],
  },
  // The tools-and-task line keeps the tool icons' height with or without them.
  lineRow: {
    minBlockSize: "1.25rem",
  },
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    blockSize: "1.5rem",
    borderRadius: vars["--aui-radius-full"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: "1.5rem",
    justifyContent: "center",
    // The ring sits outside the avatar, one gap of canvas between them.
    marginInline: vars["--aui-space-2"],
    overflow: "visible",
  },
  name: {
    flex: "0 1 auto",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  model: {
    color: vars["--aui-color-text-muted"],
    // Gives way before the name does.
    flex: "0 1000 auto",
    fontSize: vars["--aui-font-size-caption"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  status: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
    maxInlineSize: "50%",
    minInlineSize: 0,
  },
  tools: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
  },
  toolTile: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: "1.25rem",
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    inlineSize: "1.25rem",
    justifyContent: "center",
    lineHeight: 1,
  },
  // The icon slot's own rule sizes any icon inside it to this box.
  toolIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    display: "inline-flex",
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  toolMore: {
    fontVariantNumeric: "tabular-nums",
    inlineSize: "auto",
    minInlineSize: "1.25rem",
    paddingInline: vars["--aui-space-2"],
  },
  task: {
    color: vars["--aui-color-text"],
    flex: "1 1 auto",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-tight"],
    // One line tall even when it has nothing to say.
    minBlockSize: "1lh",
    minInlineSize: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  metaTimer: {
    color: "inherit",
    fontSize: "inherit",
  },
  metaAttention: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  panel: {
    alignSelf: "start",
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    gridColumn: {
      default: "1",
      [WIDE]: "2",
    },
    gridRow: {
      default: "auto",
      [WIDE]: "1 / -1",
    },
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  panelHeader: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: vars["--aui-space-4"],
  },
  panelTitle: {
    color: vars["--aui-color-text"],
    flex: "0 1 auto",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  panelSummary: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  panelActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    marginInlineStart: "auto",
  },
  notice: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
  },
  noticeError: {
    color: vars["--aui-color-danger-text"],
  },
  tree: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  treeItem: {
    columnGap: 0,
    display: "grid",
    gridTemplateColumns: `${vars["--aui-space-20"]} minmax(0, 1fr)`,
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    position: "relative",
  },
  // The trunk: down the item, or to the card's middle on the last one.
  connectorTrunk: {
    backgroundColor: vars["--aui-color-border"],
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineStart: vars["--aui-space-8"],
    inlineSize: vars["--aui-border-width-hairline"],
    position: "absolute",
  },
  connectorTrunkLastFull: {
    blockSize: subCardMiddle(SUB_CARD_HEIGHT_FULL),
    insetBlockEnd: "auto",
  },
  connectorTrunkLastCompact: {
    blockSize: subCardMiddle(SUB_CARD_HEIGHT_COMPACT),
    insetBlockEnd: "auto",
  },
  // The branch: from the trunk to the card's edge, at the card's middle.
  connectorBranch: {
    backgroundColor: vars["--aui-color-border"],
    blockSize: vars["--aui-border-width-hairline"],
    insetInlineEnd: `calc(100% - ${vars["--aui-space-20"]})`,
    insetInlineStart: vars["--aui-space-8"],
    position: "absolute",
  },
  connectorBranchFull: {
    insetBlockStart: subCardMiddle(SUB_CARD_HEIGHT_FULL),
  },
  connectorBranchCompact: {
    insetBlockStart: subCardMiddle(SUB_CARD_HEIGHT_COMPACT),
  },
  connectorMuted: {
    backgroundColor: vars["--aui-color-border-subtle"],
  },
  subCard: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    display: "flex",
    gap: vars["--aui-space-4"],
    gridColumn: "2",
    minInlineSize: 0,
    overflow: "hidden",
  },
  subCardFull: {
    blockSize: SUB_CARD_HEIGHT_FULL,
  },
  subCardCompact: {
    blockSize: SUB_CARD_HEIGHT_COMPACT,
  },
  subCardMuted: {
    opacity: 0.7,
  },
  subPrimary: {
    alignSelf: "stretch",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-surface-raised"],
    },
    borderRadius: vars["--aui-radius-panel"],
    color: vars["--aui-color-text"],
    cursor: "pointer",
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    justifyContent: "center",
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "start",
  },
  subName: {
    flex: "0 1 auto",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subResolve: {
    flexShrink: 0,
    marginInlineEnd: vars["--aui-space-8"],
  },
  subChildren: {
    gridColumn: "2",
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  step: {
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    rowGap: vars["--aui-space-2"],
  },
  stepTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  stepMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    gridColumn: "1 / -1",
  },
  dialogText: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    margin: 0,
    overflowWrap: "anywhere",
    paddingBlockEnd: vars["--aui-space-12"],
    whiteSpace: "pre-wrap",
  },
  dialogError: {
    color: vars["--aui-color-danger-text"],
  },
});

/**
 * The status ring round a main card's avatar, in the state's theme color
 * (`--state-*`, as `StateMark` draws it). The words beside it carry the state;
 * the ring repeats it at a glance.
 */
const ring = (color: string) => ({
  boxShadow: `0 0 0 ${vars["--aui-space-2"]} ${vars["--aui-color-surface"]}, 0 0 0 calc(${vars["--aui-space-2"]} + ${vars["--aui-ring-width-sm"]}) ${color}`,
});

export const agentFleetRingStyles = stylex.create({
  queued: ring(vars["--aui-color-border"]),
  running: ring("var(--state-running)"),
  waiting: ring("var(--state-needs-answer)"),
  done: ring("var(--state-completed)"),
  failed: ring(vars["--aui-color-danger"]),
  stopped: ring(vars["--aui-color-border-strong"]),
});
