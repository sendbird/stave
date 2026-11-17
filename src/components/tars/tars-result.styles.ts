import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The record row that carries the card is the container (`tarsRecordStyles.row`): narrow, a criterion's status takes its own line. */
const NARROW = "@container (max-width: 30rem)";

/**
 * The result of ended work, under its record row: the row keeps the state
 * mark on the rail, the work and the time; the card holds what the work came
 * to. All type inherits the record's size, the conversation scale's secondary
 * step (`chat-type.stylex.ts`), so nothing here names a fixed size.
 */
export const tarsResultStyles = stylex.create({
  /** Who did it and how long it took, after the work chip, in the quiet register. */
  meta: { minWidth: 0, color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" },
  card: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, maxInlineSize: "100%", boxSizing: "border-box",
    marginBlock: 0, padding: vars["--aui-space-16"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"], backgroundColor: vars["--aui-color-surface"], color: vars["--aui-color-text"],
  },
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  groupLabel: { margin: 0, color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-medium"] },
  /** Why the work stopped, in readable ink: it is the card's lead, not a footnote. */
  reason: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], overflowWrap: "anywhere" },
  criteria: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** Mark, the criterion, then what backs it at the trailing edge; narrow, that goes under the criterion. */
  criterion: {
    display: "grid", gridTemplateColumns: { default: `${vars["--aui-space-16"]} minmax(0, 1fr) auto`, [NARROW]: `${vars["--aui-space-16"]} minmax(0, 1fr)` },
    alignItems: "start", columnGap: vars["--aui-space-8"], rowGap: 0, minWidth: 0,
  },
  /** One text line tall, so the mark stays on the criterion's first line however far it wraps. */
  criterionMark: { display: "flex", alignItems: "center", justifyContent: "center", blockSize: "1lh" },
  criterionIcon: { flexShrink: 0, inlineSize: "1em", blockSize: "1em" },
  criterionText: { minWidth: 0, overflowWrap: "anywhere" },
  criterionState: {
    minWidth: 0, alignSelf: "start", justifySelf: "start", fontWeight: vars["--aui-font-weight-medium"],
    whiteSpace: { default: "nowrap", [NARROW]: "normal" }, gridColumnStart: { default: "auto", [NARROW]: 2 }, overflowWrap: "anywhere",
  },
  criteriaHeader: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: vars["--aui-space-8"], minWidth: 0 },
  criteriaCount: { margin: 0, minWidth: 0, fontWeight: vars["--aui-font-weight-semibold"], fontVariantNumeric: "tabular-nums" },
  evidenceSources: { margin: 0, paddingInlineStart: vars["--aui-space-20"], color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  evidenceNote: { margin: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** What Stave itself ran and saw pass, under the criteria: it backs the whole result, not one line. */
  checks: {
    display: "grid", gridTemplateColumns: `${vars["--aui-space-16"]} minmax(0, 1fr)`, alignItems: "start", columnGap: vars["--aui-space-8"],
    minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"],
  },
  toneVerified: { color: vars["--aui-color-success-text"] },
  toneReported: { color: vars["--aui-color-text-muted"] },
  toneUnmet: { color: vars["--aui-color-danger-text"] },
  /** Changed files, the review and the pull request on one wrapping line. */
  facts: {
    display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"], minWidth: 0, margin: 0,
    color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums",
  },
  fact: { minWidth: 0, overflowWrap: "anywhere" },
  added: { color: vars["--aui-color-diff-added-text"] },
  removed: { color: vars["--aui-color-diff-removed-text"] },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
});
