import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * `--editor*` are the Monaco theme surfaces the review thread has to sit on:
 * the zone is painted inside the diff editor, so it reads from the editor
 * palette rather than the app canvas.
 */
export const editorReviewPanelStyles = stylex.create({
  thread: {
    backgroundColor: "var(--editor)",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    color: "var(--editor-foreground)",
    marginBlock: vars["--ads-space-4"],
    marginInline: vars["--ads-space-12"],
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    backgroundColor: "color-mix(in oklch, var(--editor-muted) 55%, transparent)",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    minHeight: 32,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 10,
  },
  headerLead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  headerTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerMeta: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-micro"] },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  lineRef: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  addButton: {
    blockSize: 24,
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    inlineSize: 24,
    padding: 0,
  },
  removeButton: {
    blockSize: 24,
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-danger"] },
    flexShrink: 0,
    inlineSize: 24,
    padding: 0,
  },
  commentList: { display: "flex", flexDirection: "column" },
  commentRow: {
    alignItems: "flex-start",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  commentBody: {
    color: vars["--ads-color-text"],
    flexGrow: 1,
    flexShrink: 1,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    minWidth: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  draft: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  draftInput: {
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    minHeight: 64,
    resize: "none",
  },
  draftFooter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    marginTop: vars["--ads-space-8"],
  },
  draftHint: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
  },
  draftActions: { alignItems: "center", display: "flex", gap: vars["--ads-space-4"] },
  cancelButton: {
    blockSize: 28,
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    inlineSize: 28,
    padding: 0,
  },
  submitButton: {
    blockSize: 28,
    fontSize: vars["--ads-font-size-caption"],
    paddingInline: vars["--ads-space-8"],
  },
});
