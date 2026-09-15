import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

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
    rowGap: vars["--ads-space-4"],
    alignItems: "start",
    minWidth: 0,
    position: "relative",
  },
  header: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.04em",
    lineHeight: vars["--ads-line-height-tight"],
    minWidth: 0,
    textTransform: "uppercase",
  },
  headerGap: {
    minWidth: 0,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  columnCompact: {
    gap: vars["--ads-space-2"],
  },
  gap: {
    alignSelf: "stretch",
    minWidth: 0,
    position: "relative",
  },
  gapGlyph: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    justifyContent: "center",
    lineHeight: vars["--ads-line-height-tight"],
    paddingTop: vars["--ads-space-12"],
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
    stroke: vars["--ads-color-accent"],
    strokeWidth: 1.5,
  },
  node: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
    position: "relative",
  },
  nodeCompact: {
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  nodeLit: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-accent-soft"],
  },
  nodeMuted: {
    color: vars["--ads-color-text-muted"],
  },
  nodeRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  dot: {
    backgroundColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: "0.375rem",
    width: "0.375rem",
  },
  dotLit: {
    backgroundColor: vars["--ads-color-accent"],
  },
  primaryText: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  primaryTextMuted: {
    color: vars["--ads-color-text-muted"],
  },
  prompt: {
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    overflow: "hidden",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  caption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  mono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  signalLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  signalValue: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    overflowWrap: "anywhere",
  },
  warnNode: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
  },
  warnText: {
    color: vars["--ads-color-warning-text"],
  },
  ruleId: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ruleIdMuted: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
  },
  ladderMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  adjustNote: {
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  accentNote: {
    color: vars["--ads-color-accent"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  reason: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginTop: vars["--ads-space-4"],
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
