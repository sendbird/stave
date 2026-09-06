import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const messageStyles = stylex.create({
  // `Message` keeps the `group` + `is-user`/`is-assistant` class-name contract
  // (asserted in tests and targeted by `group-[.is-user]:` in
  // FailedOutgoingMessages). Layout is StyleX; the alignment axis depends on
  // `from`, resolved as a variant below.
  article: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  articleUser: { alignItems: "flex-end" },
  articleAssistant: { alignItems: "flex-start" },

  // The user bubble chrome is published by `Message` as CSS custom properties
  // so `MessageContent` — which has no `from` prop — can consume it without a
  // `group-[.is-user]:` ancestor selector StyleX cannot express. Callers that
  // must restyle the bubble (e.g. the destructive failed-send surface)
  // override the same custom properties on this element instead of competing
  // for the concrete background/border property, so stylesheet order never
  // decides the winner.
  content: {
    display: "flex",
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
    flexDirection: "column",
    gap: `var(--message-bubble-gap, ${vars.space12})`,
    color: vars.colorText,
    borderRadius: "var(--message-bubble-radius, 0)",
    backgroundColor: "var(--message-bubble-bg, transparent)",
    borderStyle: "var(--message-bubble-border-style, none)",
    borderWidth: "var(--message-bubble-border-width, 0)",
    borderColor: "var(--message-bubble-border-color, transparent)",
    paddingInline: "var(--message-bubble-pad-inline, 0)",
    paddingBlock: "var(--message-bubble-pad-block, 0)",
  },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: vars.space4,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  // No margin here: every caller of `MessageActions` positions the row itself
  // (ChatPanel's user/assistant variants, the failed-send surface). Declaring
  // a margin the caller must beat could only be overridden by stylesheet
  // order, so the offset lives on the caller that owns it.
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars.space4,
  },
  action: {
    height: 28,
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeBody,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },

  branchSelector: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space4,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space4,
    paddingBlock: vars.space2,
  },
  branchSelectorUser: { alignSelf: "flex-end" },
  branchSelectorAssistant: { alignSelf: "flex-start" },
  branchArrow: {
    borderRadius: vars.radiusMark,
    padding: vars.space2,
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorSelectionFill} 70%, transparent)`,
    },
  },
  branchArrowIcon: { width: 12, height: 12 },
  branchPage: {
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },

  attachments: {
    marginBottom: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  // The remove button reveals on hover of the attachment tile. StyleX has no
  // `group-hover:`, so the tile publishes a display value under its own
  // `:hover` and the button reads it.
  attachment: {
    position: "relative",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorSurface} 60%, transparent)`,
    padding: vars.space8,
    "--attachment-remove-display": {
      default: "none",
      ":hover": "inline-flex",
    },
  },
  attachmentImage: {
    height: 96,
    width: 96,
    borderRadius: vars.radiusMark,
    objectFit: "cover",
  },
  attachmentFile: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  attachmentFileIcon: { width: 14, height: 14 },
  attachmentFileName: {
    maxWidth: 176,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  attachmentRemove: {
    position: "absolute",
    right: -8,
    top: -8,
    display: "var(--attachment-remove-display, none)",
    borderRadius: vars.radiusFull,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: vars.colorCanvas,
    padding: vars.space2,
  },
  attachmentRemoveIcon: { width: 12, height: 12 },

  // Plain response body (prompt-token path).
  responseBody: {
    minWidth: 0,
    maxWidth: "100%",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  tokenMargin: { marginInline: vars.space2 },

  codeTitle: {
    minWidth: 0,
    gap: vars.space8,
  },
  codeLanguage: { flexShrink: 0 },
});
