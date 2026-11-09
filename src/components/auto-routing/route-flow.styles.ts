import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Five fixed columns with a narrow gap column between each pair. The gap
 * columns host the connector between the lit nodes; everything else is plain
 * grid flow so the layout never depends on measurement.
 */
const COLUMNS =
  "minmax(0, 1.1fr) 1.25rem minmax(0, 1fr) 1.25rem minmax(0, 0.7fr) 1.25rem minmax(0, 1.1fr) 1.25rem minmax(0, 1.3fr)";

export const routeFlowStyles = stylex.create({
  root: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    columnGap: 0,
    rowGap: vars["--aui-space-4"],
    alignItems: "start",
    minWidth: 0,
    position: "relative",
  },
  header: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.04em",
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    textTransform: "uppercase",
  },
  headerGap: {
    minWidth: 0,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  columnCompact: {
    gap: vars["--aui-space-2"],
  },
  gap: {
    alignSelf: "stretch",
    minWidth: 0,
    position: "relative",
  },
  gapGlyph: {
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    justifyContent: "center",
    lineHeight: vars["--aui-line-height-tight"],
    paddingTop: vars["--aui-space-12"],
  },
  gapSvg: {
    display: "block",
    height: "100%",
    insetBlockStart: 0,
    insetInlineStart: 0,
    overflow: "visible",
    pointerEvents: "none",
    position: "absolute",
    width: "100%",
  },
  connectorPath: {
    fill: "none",
    stroke: vars["--aui-color-accent"],
    strokeWidth: 1.5,
  },
  node: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
    position: "relative",
  },
  nodeCompact: {
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-4"],
  },
  nodeLit: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-accent-soft"],
  },
  nodeMuted: {
    color: vars["--aui-color-text-muted"],
  },
  nodeRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  dot: {
    backgroundColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    height: "0.375rem",
    width: "0.375rem",
  },
  dotLit: {
    backgroundColor: vars["--aui-color-accent"],
  },
  primaryText: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  primaryTextMuted: {
    color: vars["--aui-color-text-muted"],
  },
  prompt: {
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    overflow: "hidden",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  caption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  mono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  signalLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  signalValue: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    overflowWrap: "anywhere",
  },
  warnNode: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
  },
  warnText: {
    color: vars["--aui-color-warning-text"],
  },
  ruleId: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ruleIdMuted: {
    color: vars["--aui-color-text-muted"],
    fontWeight: vars["--aui-font-weight-regular"],
  },
  ladderMeta: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  adjustNote: {
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  accentNote: {
    color: vars["--aui-color-accent"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  reason: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    marginTop: vars["--aui-space-4"],
    overflowWrap: "anywhere",
  },
  srOnly: {
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
