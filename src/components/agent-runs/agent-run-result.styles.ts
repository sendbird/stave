import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

/** Styles of the agent run's Result card. Existing AUI tokens only. */
export const agentRunResultStyles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    minWidth: 0,
    marginBlock: vars["--aui-space-16"],
    padding: vars["--aui-space-12"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text"],
  },
  header: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, minHeight: 24 },
  headline: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  headlineState: { fontWeight: vars["--aui-font-weight-semibold"] },
  headlineMeta: { color: vars["--aui-color-text-muted"] },
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  facts: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  summary: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
    color: vars["--aui-color-text"],
    overflowWrap: "anywhere",
  },
  reason: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"] },
  /** The run's own words in the Progress header, one line under the agent. */
  assignment: { flex: "1 1 auto", minWidth: 0 },
});
