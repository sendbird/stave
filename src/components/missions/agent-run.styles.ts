import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/** Styles of the agent run's Result card. Existing ADS tokens only. */
export const agentRunStyles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    minWidth: 0,
    marginBlock: vars["--ads-space-16"],
    padding: vars["--ads-space-12"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text"],
  },
  header: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0, minHeight: 24 },
  headline: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  headlineState: { fontWeight: vars["--ads-font-weight-semibold"] },
  headlineMeta: { color: vars["--ads-color-text-muted"] },
  group: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  facts: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  summary: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    color: vars["--ads-color-text"],
    overflowWrap: "anywhere",
  },
  reason: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--ads-space-8"] },
  /** The run's own words in the Progress header, one line under the agent. */
  assignment: { flex: "1 1 auto", minWidth: 0 },
});
