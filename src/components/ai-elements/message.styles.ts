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
    gap: vars["--ads-space-8"],
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
    gap: `var(--message-bubble-gap, ${vars["--ads-space-12"]})`,
    color: vars["--ads-color-text"],
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
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  // No margin here: every caller of `MessageActions` positions the row itself
  // (ChatPanel's user/assistant variants, the failed-send surface). Declaring
  // a margin the caller must beat could only be overridden by stylesheet
  // order, so the offset lives on the caller that owns it.
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  action: {
    height: 28,
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },

  branchSelector: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
  },
  branchSelectorUser: { alignSelf: "flex-end" },
  branchSelectorAssistant: { alignSelf: "flex-start" },
  branchArrow: {
    borderRadius: vars["--ads-radius-mark"],
    padding: vars["--ads-space-2"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 70%, transparent)`,
    },
  },
  branchArrowIcon: { width: 12, height: 12 },
  branchPage: {
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },

  attachments: {
    marginBottom: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  // The remove button reveals on hover of the attachment tile. StyleX has no
  // `group-hover:`, so the tile publishes a display value under its own
  // `:hover` and the button reads it.
  attachment: {
    position: "relative",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface"]} 60%, transparent)`,
    padding: vars["--ads-space-8"],
    "--attachment-remove-display": {
      default: "none",
      ":hover": "inline-flex",
    },
  },
  attachmentImage: {
    height: 96,
    width: 96,
    borderRadius: vars["--ads-radius-mark"],
    objectFit: "cover",
  },
  attachmentFile: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
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
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: vars["--ads-color-canvas"],
    padding: vars["--ads-space-2"],
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
  tokenMargin: { marginInline: vars["--ads-space-2"] },

  codeTitle: {
    minWidth: 0,
    gap: vars["--ads-space-8"],
  },
  codeLanguage: { flexShrink: 0 },
});
