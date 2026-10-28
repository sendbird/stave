import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/**
 * Shared agent run styles. Existing ADS tokens only; no new theme colors.
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
  toneDone: { color: vars["--ads-color-success-text"] },
  toneActive: { color: vars["--ads-color-accent"] },
  toneWaiting: { color: vars["--ads-color-warning-text"] },
  toneAttention: { color: vars["--ads-color-danger-text"] },
  toneIdle: { color: vars["--ads-color-text-muted"] },
  toneSkipped: { color: vars["--ads-color-text-muted"] },
  icon: { flex: "0 0 auto", width: 14, height: 14 },
  /** The step a running run is on turns, as the ADS spinner does; still under reduced motion. */
  spinning: {
    animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  iconSm: { flex: "0 0 auto", width: 12, height: 12 },

  /* Text ------------------------------------------------------------------- */
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-danger-text"],
  },
  body: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    color: vars["--ads-color-text"],
    overflowWrap: "anywhere",
  },
  muted: { color: vars["--ads-color-text-muted"] },
  mono: { fontFamily: vars["--ads-font-mono"], fontSize: "0.92em" },
  tabular: { fontVariantNumeric: "tabular-nums" },
  list: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], margin: 0, padding: 0, listStyle: "none" },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--ads-space-4"] },
  inline: { display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"], minWidth: 0 },

  /* Panel ------------------------------------------------------------------ */
  panel: { display: "flex", flexDirection: "column", gap: vars["--ads-space-20"], minWidth: 0 },
  head: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"], minWidth: 0 },
  headRow: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-12"], minWidth: 0 },
  headText: { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 },
  eyebrow: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.35rem",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
  headActions: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: vars["--ads-space-2"] },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  badge: { flex: "0 0 auto" },
  statusText: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  /* Sections --------------------------------------------------------------- */
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  sectionRoomy: { gap: vars["--ads-space-12"] },
  sectionRule: {
    paddingTop: vars["--ads-space-16"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  sectionHeader: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minHeight: 24, minWidth: 0 },
  // A section of the panel: a heading that reads as one, above its content.
  // Groups inside a section use `groupLabel`, the small uppercase level below.
  sectionTitle: {
    flex: "1 1 auto",
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  sectionIcon: { flex: "0 0 auto", width: 14, height: 14, color: vars["--ads-color-text-subtle"] },
  sectionAside: {
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },

  /* Checklist (Done when) -------------------------------------------------- */
  checkList: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], margin: 0, padding: 0, listStyle: "none" },
  check: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "baseline",
    columnGap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  // The slot follows the first text line, even when the copy wraps or gains details.
  checkMark: { alignSelf: "start", alignItems: "center", blockSize: "1lh", display: "flex", width: 16, justifyContent: "center" },
  checkText: { minWidth: 0, overflowWrap: "anywhere" },
  checkDetail: { display: "block", marginBlockStart: 2, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  checkState: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
    whiteSpace: "nowrap",
  },
  checkNote: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  decisionDetail: { display: "block", overflowWrap: "anywhere" },

  /* Facts (key/value) ------------------------------------------------------ */
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    columnGap: vars["--ads-space-16"],
    rowGap: vars["--ads-space-4"],
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  factLabel: { color: vars["--ads-color-text-muted"] },
  factValue: { margin: 0, minWidth: 0, color: vars["--ads-color-text"], overflowWrap: "anywhere" },

  /* Stage timeline --------------------------------------------------------- */
  stageHeader: {
    width: "100%",
    minWidth: 0,
    justifyContent: "flex-start",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--ads-space-4"]})`,
    textAlign: "start",
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text"],
  },
  stageTitle: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stageTitleCurrent: { fontWeight: vars["--ads-font-weight-medium"] },
  stageTitlePending: { color: vars["--ads-color-text-muted"] },
  // Marks a stage Stave performs itself, so it reads apart from the agent's.
  stageKind: {
    flex: "0 0 auto",
    paddingInline: 6,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "18px",
    color: vars["--ads-color-text-muted"],
  },
  stageMeta: {
    flex: "0 0 auto",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  chevron: {
    flex: "0 0 auto",
    width: 14,
    height: 14,
    color: vars["--ads-color-text-subtle"],
    transitionProperty: "transform",
    transitionDuration: vars["--ads-motion-duration-fast"],
  },
  chevronOpen: { transform: "rotate(90deg)" },
  chevronSm: {
    transitionProperty: "transform",
    transitionDuration: vars["--ads-motion-duration-fast"],
  },
  stageBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-4"],
    paddingBottom: vars["--ads-space-4"],
    minWidth: 0,
  },
  stageGroup: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  groupLabel: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "16px",
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-muted"],
  },
  callout: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  calloutNeutral: { backgroundColor: vars["--ads-color-canvas-subtle"] },
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  added: { color: vars["--ads-color-diff-added-text"] },
  removed: { color: vars["--ads-color-diff-removed-text"] },
  itemList: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], margin: 0, padding: 0, listStyle: "none" },
  // A decision and its reason, set off by a rule so each reads as one item.
  decision: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    paddingInlineStart: vars["--ads-space-12"],
    borderInlineStartWidth: 2,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--ads-color-border"],
  },
  decisionText: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  bulletItem: { display: "grid", gridTemplateColumns: "12px minmax(0, 1fr)", alignItems: "baseline", minWidth: 0 },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: vars["--ads-color-text-subtle"],
    transform: "translateY(-2px)",
  },
  bulletText: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  decisionReason: { fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-normal"], color: vars["--ads-color-text-muted"] },
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
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  promptTrigger: { minInlineSize: 0 },
  promptLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  /**
   * Holds the row's place until the run writes the prompt: `agentSurface.row`
   * laid out like the trigger, so the glyph and label land where they will.
   */
  promptPending: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    columnGap: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
  },
  promptBody: { padding: vars["--ads-space-12"] },
  /** Stave's words in muted ink, so they never read as the user's own. */
  promptMarkdown: { minInlineSize: 0, color: vars["--ads-color-text-muted"] },
  disclosure: { minWidth: 0 },
  disclosureSummary: {
    alignSelf: "flex-start",
    gap: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--ads-space-4"]})`,
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
  },
  quote: {
    margin: 0,
    marginTop: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    color: vars["--ads-color-accent"],
    textDecoration: { default: "none", ":hover": "underline" },
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
  },

  /* Evidence --------------------------------------------------------------- */
  evidence: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  evidenceHeading: { display: "flex", alignItems: "baseline", gap: vars["--ads-space-8"], minWidth: 0 },
  evidenceMetadata: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--ads-space-8"], color: vars["--ads-color-text-muted"] },
  evidenceLabel: { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", color: vars["--ads-color-text"] },
  evidenceCommand: { display: "block", overflowWrap: "anywhere", color: vars["--ads-color-text-muted"] },

  /* Report ----------------------------------------------------------------- */
  shareForm: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
  },
  shareActions: { display: "flex", justifyContent: "flex-end", gap: vars["--ads-space-4"] },
  // The report's figures, as one strip in the Run card's style: label above value.
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(4.5rem, 1fr))",
    margin: 0,
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
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
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    minWidth: 0,
    borderInlineStartWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--ads-color-border-subtle"],
  },
  statLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-muted"],
  },
  statValue: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: 1.2,
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
  },

  /* Transcript divider ----------------------------------------------------- */
  divider: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    marginBlock: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-subtle"],
  },
  dividerRule: { flex: "1 1 auto", height: 1, backgroundColor: vars["--ads-color-border-subtle"] },
  dividerText: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    flex: "0 1 auto",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  dividerStage: { flex: "0 0 auto", color: vars["--ads-color-text-muted"], fontWeight: vars["--ads-font-weight-medium"] },
  dividerReason: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
});
