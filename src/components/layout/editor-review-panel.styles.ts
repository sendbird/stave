import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * `--editor*` are the Monaco theme surfaces the review thread has to sit on:
 * the zone is painted inside the diff editor, so it reads from the editor
 * palette rather than the app canvas.
 */
export const editorReviewPanelStyles = stylex.create({
  thread: {
    backgroundColor: "var(--editor)",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    color: "var(--editor-foreground)",
    marginBlock: vars["--aui-space-4"],
    marginInline: vars["--aui-space-12"],
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    backgroundColor: "color-mix(in oklch, var(--editor-muted) 55%, transparent)",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    minHeight: 32,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: 10,
  },
  headerLead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  headerTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  headerMeta: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  lineRef: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  addButton: {
    blockSize: 24,
    borderRadius: vars["--aui-radius-mark"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    inlineSize: 24,
    padding: 0,
  },
  removeButton: {
    blockSize: 24,
    borderRadius: vars["--aui-radius-mark"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-danger"] },
    flexShrink: 0,
    inlineSize: 24,
    padding: 0,
  },
  commentList: { display: "flex", flexDirection: "column" },
  sentRow: { alignItems: "center" },
  sentBody: { display: "flex", flexDirection: "column", flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0 },
  sentState: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"] },
  // Same ink as Review's comment list, which says the same words.
  sentStateChanged: { color: vars["--aui-color-success-text"] },
  resolveButton: { flexShrink: 0 },
  commentRow: {
    alignItems: "flex-start",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    display: "flex",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
  },
  commentBody: {
    color: vars["--aui-color-text"],
    flexGrow: 1,
    flexShrink: 1,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    minWidth: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  draft: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
  },
  draftInput: {
    backgroundColor: vars["--aui-color-canvas"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    minHeight: 64,
    resize: "none",
  },
  draftFooter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    marginTop: vars["--aui-space-8"],
  },
  draftHint: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
  },
  draftActions: { alignItems: "center", display: "flex", gap: vars["--aui-space-4"] },
  cancelButton: {
    blockSize: 28,
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    inlineSize: 28,
    padding: 0,
  },
  submitButton: {
    blockSize: 28,
    fontSize: vars["--aui-font-size-caption"],
    paddingInline: vars["--aui-space-8"],
  },
});
