import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The card's secondary size, from the chat font size (as `tars-decision.styles`). */
const TEXT = `var(--tars-text-size, ${vars["--aui-font-size-lead"]})`;
const SECONDARY = `max(${vars["--aui-font-size-caption"]}, calc(${TEXT} * 0.875))`;
const LEADING = "1.5";

/**
 * The publish card adds to the decision card (`tars-decision.styles`) only
 * what a confirmation with editable words needs: labelled fields that take
 * the card's width, and a bounded, scrolling view of the body, rendered or as
 * the raw text that is sent. Every length comes from AUI tokens.
 */
export const tarsPublishStyles = stylex.create({
  fields: { display: "grid", gap: vars["--aui-space-12"], minWidth: 0, margin: 0 },
  /** Type and message share a line when there is room; narrow, the message wraps under the type. */
  commitLine: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: vars["--aui-space-8"], minWidth: 0 },
  field: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0 },
  typeField: { flex: "0 0 auto" },
  grow: { flex: "1 1 14rem" },
  label: { color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING },
  /** The body's label with the switch between its rendered and raw views. */
  bodyHeader: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The body, never wider than the card, scrolling past a few lines. */
  body: {
    margin: 0, minWidth: 0, maxHeight: "12rem", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box",
    padding: vars["--aui-space-12"], borderRadius: vars["--aui-radius-control"], backgroundColor: vars["--aui-color-canvas-subtle"],
    color: vars["--aui-color-text"], overflowWrap: "anywhere",
  },
  /** The body as GitHub receives it: mono and wrapped. */
  bodyRaw: { fontFamily: vars["--aui-font-mono"], fontSize: SECONDARY, lineHeight: LEADING, whiteSpace: "pre-wrap" },
  hint: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING, overflowWrap: "anywhere" },
  /** Branch names and the repository are machine values: they wrap anywhere instead of widening the card. */
  machine: { fontFamily: vars["--aui-font-mono"], overflowWrap: "anywhere" },
  link: { color: vars["--aui-color-accent"], textDecoration: { default: "none", ":hover": "underline" }, overflowWrap: "anywhere" },
  diagnostic: { color: vars["--aui-color-text-muted"], fontFamily: vars["--aui-font-mono"], overflowWrap: "anywhere", minWidth: 0 },
});
