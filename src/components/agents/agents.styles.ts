import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/** Agents tab: the list and detail layout come from the playbook styles; these are the parts only agents have. */
export const agentStyles = stylex.create({
  /*
   * Resizable list. With room for the list, its column is as wide as it was
   * dragged (`--agents-list-width`, from the layout) but never so wide that
   * the detail drops under 512px, and the drag handle has its own 1px column
   * on the list's edge. The handle's sash is that edge's hairline, so the list
   * draws no border of its own.
   */
  tabResizable: {
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 56rem)":
        "clamp(240px, var(--agents-list-width), calc(100% - 513px)) 1px minmax(0, 1fr)",
    },
  },
  masterResizable: { borderInlineEndWidth: 0 },
  // Shown with the list, which the tab hides below 56rem for its picker.
  listResizer: { display: { default: "none", "@media (min-width: 56rem)": "block" } },

  source: {
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-subtle"],
  },
  archived: { color: vars["--ads-color-text-subtle"], textDecorationLine: "line-through" },
  instructions: {
    margin: 0,
    padding: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: "18rem",
    overflowY: "auto",
  },
  support: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: vars["--ads-font-size-caption"],
  },
  supportCell: {
    paddingBlock: vars["--ads-space-4"],
    paddingInlineEnd: vars["--ads-space-12"],
    textAlign: "start",
    verticalAlign: "top",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  supportHead: { color: vars["--ads-color-text-subtle"], fontWeight: vars["--ads-font-weight-medium"] },
  muted: { color: vars["--ads-color-text-muted"] },
  assign: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
  },
  assignRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], flexWrap: "wrap" },
  runs: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], margin: 0, padding: 0, listStyle: "none" },
  run: {
    display: "flex",
    gap: vars["--ads-space-8"],
    alignItems: "baseline",
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
  },
  runTitle: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  runLink: { display: "block", textAlign: "start", padding: 0, color: vars["--ads-color-text"], cursor: "pointer" },
  roles: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-12"] },
  canCall: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  noteText: { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" },
  problems: { marginTop: vars["--ads-space-12"], paddingInline: vars["--ads-space-8"] },
  problem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  runState: { flex: "0 0 auto", color: vars["--ads-color-text-muted"] },

  /* Profile header ------------------------------------------------------- */
  profile: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-16"], minWidth: 0 },
  profileText: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], flex: "1 1 auto", minWidth: 0 },
  profileName: { margin: 0, fontSize: vars["--ads-font-size-title"], fontWeight: vars["--ads-font-weight-semibold"], overflowWrap: "anywhere" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-4"], marginTop: vars["--ads-space-4"] },

  /* List rows with avatars ----------------------------------------------- */
  rowLead: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  rowText: { display: "flex", flexDirection: "column", minWidth: 0, gap: 0 },

  /* Sectioned editor ----------------------------------------------------- */
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-16"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  sectionFirst: { borderTopWidth: 0, paddingTop: 0 },

  /* Colour chooser ------------------------------------------------------- */
  swatches: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"] },
  swatch: {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-ring-width-md"],
    borderStyle: "solid",
    borderColor: { default: "transparent", ":hover": vars["--ads-color-border-strong"] },
    backgroundColor: "var(--agent-swatch-color)",
    cursor: "pointer",
  },
  swatchSelected: { borderColor: vars["--ads-color-border-focus"] },

  /* Tag field (allow/deny tools, skills) --------------------------------- */
  tags: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-4"], alignItems: "center" },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    paddingInlineStart: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-4"],
    height: 24,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    fontSize: vars["--ads-font-size-caption"],
  },
  tagRemove: { width: 16, height: 16, minHeight: 0, padding: 0, color: vars["--ads-color-text-muted"] },
  tagInput: { flex: "1 1 8rem", minWidth: "6rem" },

  /* Delete dialog reference list ----------------------------------------- */
  refList: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], margin: 0, padding: 0, listStyle: "none" },
  refItem: { display: "flex", flexDirection: "column", gap: 2, fontSize: vars["--ads-font-size-caption"] },
  refKind: { color: vars["--ads-color-text-subtle"], fontSize: vars["--ads-font-size-micro"], textTransform: "uppercase", letterSpacing: "0.02em" },

  /* New agent dialog / editor ------------------------------------------- */
  blankRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  advanced: { marginTop: vars["--ads-space-12"] },

  /* History -------------------------------------------------------------- */
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
  },
  historyMain: { display: "flex", flexDirection: "column", gap: 0, flex: "1 1 auto", minWidth: 0 },
  historyWhen: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"] },
  historyMeta: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], flex: "0 0 auto" },

  /* Detail layout -------------------------------------------------------- */
  detail: { gap: vars["--ads-space-16"] },
  pane: { display: "flex", flexDirection: "column", gap: vars["--ads-space-16"] },
  // The shared footer is a full-bleed bar; inside the editor it sits in the
  // form column, so Save lines up with the fields instead of 24px in from them.
  editorFooter: { paddingInline: 0, backgroundColor: "transparent" },
  tabPane: { paddingTop: vars["--ads-space-16"] },

  /* Activity ------------------------------------------------------------- */
  activity: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  summary: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--ads-space-12"], rowGap: vars["--ads-space-4"] },
  attention: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], fontVariantNumeric: "tabular-nums" },

  /* Learned suggestions: one line when there is nothing to review ---------- */
  suggestionsLine: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  suggestionsLineText: { flex: "1 1 auto", flexWrap: "wrap", minWidth: 0, overflowWrap: "anywhere" },
  suggestionsLineTitle: { flex: "0 0 auto" },
  suggestions: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },

  /* Learned suggestions -------------------------------------------------- */
  suggestion: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
  },
  suggestionHead: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  suggestionActions: { display: "flex", justifyContent: "flex-end", gap: vars["--ads-space-8"] },
});
