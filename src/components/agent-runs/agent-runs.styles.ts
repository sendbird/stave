import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/**
 * Shared agent run styles. Existing AUI tokens only; no new theme colors.
 *
 * Rhythm: sections are 20px apart, rows inside a section 8px, and every row
 * keeps a 16px mark column so text starts in one column down the panel.
 */
export const agentRunStyles = stylex.create({
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },

  /* Tones ------------------------------------------------------------------ */
  toneDone: { color: vars["--aui-color-success-text"] },
  toneActive: { color: vars["--aui-color-accent"] },
  toneWaiting: { color: vars["--aui-color-warning-text"] },
  toneAttention: { color: vars["--aui-color-danger-text"] },
  toneIdle: { color: vars["--aui-color-text-muted"] },
  toneSkipped: { color: vars["--aui-color-text-muted"] },
  icon: { flex: "0 0 auto", width: 14, height: 14 },
  /** The step a running run is on turns, as the AUI spinner does; still under reduced motion. */
  spinning: {
    animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  iconSm: { flex: "0 0 auto", width: 12, height: 12 },

  /* Text ------------------------------------------------------------------- */
  notice: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  error: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-danger-text"],
  },
  body: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    color: vars["--aui-color-text"],
    overflowWrap: "anywhere",
  },
  muted: { color: vars["--aui-color-text-muted"] },
  mono: { fontFamily: vars["--aui-font-mono"], fontSize: "0.92em" },
  tabular: { fontVariantNumeric: "tabular-nums" },
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], margin: 0, padding: 0, listStyle: "none" },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"] },
  inline: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0 },

  /* Panel ------------------------------------------------------------------ */
  panel: { display: "flex", flexDirection: "column", gap: vars["--aui-space-20"], minWidth: 0 },
  head: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0 },
  headRow: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-12"], minWidth: 0 },
  headText: { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 },
  eyebrow: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "1.35rem",
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
  headActions: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: vars["--aui-space-2"] },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  badge: { flex: "0 0 auto" },
  statusText: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  /* Sections --------------------------------------------------------------- */
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  sectionRoomy: { gap: vars["--aui-space-12"] },
  sectionRule: {
    paddingTop: vars["--aui-space-16"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
  },
  sectionHeader: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minHeight: 24, minWidth: 0 },
  // A section of the panel: a heading that reads as one, above its content.
  // Groups inside a section use `groupLabel`, the small uppercase level below.
  sectionTitle: {
    flex: "1 1 auto",
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  sectionIcon: { flex: "0 0 auto", width: 14, height: 14, color: vars["--aui-color-text-subtle"] },
  sectionAside: {
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },

  /* Checklist (Done when) -------------------------------------------------- */
  checkList: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none" },
  check: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
  },
  // The slot follows the first text line, even when the copy wraps or gains details.
  checkMark: { alignSelf: "start", alignItems: "center", blockSize: "1lh", display: "flex", width: 16, justifyContent: "center" },
  checkText: { minWidth: 0, overflowWrap: "anywhere" },
  checkDetail: { display: "block", marginBlockStart: 2, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  checkState: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
    whiteSpace: "nowrap",
  },
  checkNote: { margin: 0, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  decisionDetail: { display: "block", overflowWrap: "anywhere" },

  /* Facts (key/value) ------------------------------------------------------ */
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    columnGap: vars["--aui-space-16"],
    rowGap: vars["--aui-space-4"],
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  factLabel: { color: vars["--aui-color-text-muted"] },
  factValue: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], overflowWrap: "anywhere" },

  /* Stage timeline --------------------------------------------------------- */
  stageHeader: {
    width: "100%",
    minWidth: 0,
    justifyContent: "flex-start",
    gap: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--aui-space-4"]})`,
    textAlign: "start",
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-text"],
  },
  stageTitle: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stageTitleCurrent: { fontWeight: vars["--aui-font-weight-medium"] },
  stageTitlePending: { color: vars["--aui-color-text-muted"] },
  // Marks a stage Stave performs itself, so it reads apart from the agent's.
  stageKind: {
    flex: "0 0 auto",
    paddingInline: 6,
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: "18px",
    color: vars["--aui-color-text-muted"],
  },
  stageMeta: {
    flex: "0 0 auto",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  chevron: {
    flex: "0 0 auto",
    width: 14,
    height: 14,
    color: vars["--aui-color-text-subtle"],
    transitionProperty: "transform",
    transitionDuration: vars["--aui-motion-duration-fast"],
  },
  chevronOpen: { transform: "rotate(90deg)" },
  chevronSm: {
    transitionProperty: "transform",
    transitionDuration: vars["--aui-motion-duration-fast"],
  },
  stageBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    paddingTop: vars["--aui-space-4"],
    paddingBottom: vars["--aui-space-4"],
    minWidth: 0,
  },
  stageGroup: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  groupLabel: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: vars["--aui-color-text-muted"],
  },
  callout: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-danger-soft"],
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  calloutNeutral: { backgroundColor: vars["--aui-color-canvas-subtle"] },
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  added: { color: vars["--aui-color-diff-added-text"] },
  removed: { color: vars["--aui-color-diff-removed-text"] },
  itemList: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none" },
  // A decision and its reason, set off by a rule so each reads as one item.
  decision: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    paddingInlineStart: vars["--aui-space-12"],
    borderInlineStartWidth: 2,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--aui-color-border"],
  },
  decisionText: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
  },
  bulletItem: { display: "grid", gridTemplateColumns: "12px minmax(0, 1fr)", alignItems: "baseline", minWidth: 0 },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: vars["--aui-color-text-subtle"],
    transform: "translateY(-2px)",
  },
  bulletText: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
  },
  decisionReason: { fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-normal"], color: vars["--aui-color-text-muted"] },
  /**
   * Wraps an agent run's user bubble so it keeps its own width: the prompt row
   * under it may open wider (up to the column), and `MessageContent` fills its
   * parent (`width: 100%`), so the bubble would stretch with it otherwise.
   */
  promptBubble: { alignSelf: "flex-end", display: "flex", flexDirection: "column", minInlineSize: 0, maxInlineSize: "100%" },
  /** The prompt row under the bubble: the column's full width once open. */
  promptRow: { minInlineSize: 0 },
  /** The trigger sits under the bubble's end edge, beside the message actions. */
  promptHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  /** Under the stage card the row starts where the card does. */
  promptAlignStart: { flexDirection: "row-reverse", justifyContent: "flex-end" },
  promptTrigger: { minInlineSize: 0 },
  promptLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  /**
   * Holds the row's place until the run writes the prompt: `agentSurface.row`
   * laid out like the trigger, so the glyph and label land where they will.
   */
  promptPending: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    columnGap: vars["--aui-space-8"],
    color: vars["--aui-color-text-muted"],
  },
  promptBody: { padding: vars["--aui-space-12"] },
  /** Stave's words in muted ink, so they never read as the user's own. */
  promptMarkdown: { minInlineSize: 0, color: vars["--aui-color-text-muted"] },
  /** Stave's stage card: the column's full width, on the agent's side. */
  promptStageCard: { minInlineSize: 0, inlineSize: "100%" },
  /** Two lines (title, done-when), so the trigger grows past one control height. */
  promptStageTrigger: {
    alignItems: "flex-start",
    inlineSize: "100%",
    paddingBlock: vars["--aui-space-8"],
    textAlign: "start",
  },
  promptStageText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  promptStageTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  promptStageDoneWhen: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    whiteSpace: "normal",
  },
  disclosure: { minWidth: 0 },
  disclosureSummary: {
    alignSelf: "flex-start",
    gap: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--aui-space-4"]})`,
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-text-muted"],
  },
  quote: {
    margin: 0,
    marginTop: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    color: vars["--aui-color-accent"],
    textDecoration: { default: "none", ":hover": "underline" },
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },

  /* Evidence --------------------------------------------------------------- */
  evidence: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  evidenceHeading: { display: "flex", alignItems: "baseline", gap: vars["--aui-space-8"], minWidth: 0 },
  evidenceMetadata: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"], color: vars["--aui-color-text-muted"] },
  evidenceLabel: { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", color: vars["--aui-color-text"] },
  evidenceCommand: { display: "block", overflowWrap: "anywhere", color: vars["--aui-color-text-muted"] },

  /* Report ----------------------------------------------------------------- */
  shareForm: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
  },
  shareActions: { display: "flex", justifyContent: "flex-end", gap: vars["--aui-space-4"] },
  // The report's figures, as one strip in the Run card's style: label above value.
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(4.5rem, 1fr))",
    margin: 0,
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    overflow: "hidden",
  },
  statsTwo: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  statsThree: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  statsFour: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
  statsFive: { gridTemplateColumns: "repeat(5, minmax(0, 1fr))" },
  statTile: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    minWidth: 0,
    borderInlineStartWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--aui-color-border-subtle"],
  },
  statLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--aui-color-text-muted"],
  },
  statValue: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: 1.2,
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
  },

  /* Transcript divider ----------------------------------------------------- */
  divider: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    marginBlock: vars["--aui-space-16"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-subtle"],
  },
  dividerRule: { flex: "1 1 auto", height: 1, backgroundColor: vars["--aui-color-border-subtle"] },
  dividerText: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    flex: "0 1 auto",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  dividerStage: { flex: "0 0 auto", color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-medium"] },
  dividerReason: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
});
