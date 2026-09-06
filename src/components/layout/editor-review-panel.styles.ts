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
    borderColor: vars.colorBorder,
    borderLeftColor: vars.colorAccent,
    borderLeftWidth: 2,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    color: "var(--editor-foreground)",
    marginBlock: vars.space4,
    marginInline: vars.space12,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    backgroundColor: "color-mix(in oklch, var(--editor-muted) 55%, transparent)",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
    minHeight: 32,
    paddingBlock: vars.space4,
    paddingInline: 10,
  },
  headerLead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  headerTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
  },
  headerMeta: { color: vars.colorTextMuted, fontSize: vars.fontSizeMicro },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
  lineRef: {
    color: vars.colorText,
    fontFamily: vars.fontMono,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightSemibold,
  },
  addButton: {
    blockSize: 24,
    borderRadius: vars.radiusMark,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    inlineSize: 24,
    padding: 0,
  },
  removeButton: {
    blockSize: 24,
    borderRadius: vars.radiusMark,
    color: { default: vars.colorTextMuted, ":hover": vars.colorDanger },
    flexShrink: 0,
    inlineSize: 24,
    padding: 0,
  },
  commentList: { display: "flex", flexDirection: "column" },
  commentRow: {
    alignItems: "flex-start",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: { default: vars.borderWidthHairline, ":first-child": 0 },
    display: "flex",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: 10,
  },
  commentBody: {
    color: vars.colorText,
    flexGrow: 1,
    flexShrink: 1,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    minWidth: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  draft: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    paddingBlock: vars.space8,
    paddingInline: 10,
  },
  draftInput: {
    backgroundColor: vars.colorCanvas,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    minHeight: 64,
    resize: "none",
  },
  draftFooter: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
    marginTop: vars.space8,
  },
  draftHint: { color: vars.colorTextMuted, fontSize: vars.fontSizeMicro },
  draftActions: { alignItems: "center", display: "flex", gap: vars.space4 },
  cancelButton: {
    blockSize: 28,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    inlineSize: 28,
    padding: 0,
  },
  submitButton: {
    blockSize: 28,
    fontSize: vars.fontSizeCaption,
    paddingInline: vars.space8,
  },
});
