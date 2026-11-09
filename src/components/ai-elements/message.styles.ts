import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const messageStyles = stylex.create({
  // `Message` keeps the `group` + `is-user`/`is-assistant` class-name contract
  // (asserted in tests and targeted by `group-[.is-user]:` in
  // FailedOutgoingMessages). Layout is StyleX; the alignment axis depends on
  // `from`, resolved as a variant below.
  article: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
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
    gap: `var(--message-bubble-gap, ${vars["--aui-space-12"]})`,
    color: vars["--aui-color-text"],
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
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  // No margin here: every caller of `MessageActions` positions the row itself
  // (ChatPanel's user/assistant variants, the failed-send surface). Declaring
  // a margin the caller must beat could only be overridden by stylesheet
  // order, so the offset lives on the caller that owns it.
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  action: {
    height: 28,
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },

  attachments: {
    marginBottom: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  // The remove button reveals on hover of the attachment tile. StyleX has no
  // `group-hover:`, so the tile publishes a display value under its own
  // `:hover` and the button reads it.
  attachment: {
    position: "relative",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface"]} 60%, transparent)`,
    padding: vars["--aui-space-8"],
    "--attachment-remove-display": {
      default: "none",
      ":hover": "inline-flex",
    },
  },
  attachmentImage: {
    height: 96,
    width: 96,
    borderRadius: vars["--aui-radius-mark"],
    objectFit: "cover",
  },
  attachmentFile: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
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
    borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    backgroundColor: vars["--aui-color-canvas"],
    padding: vars["--aui-space-2"],
    // The painted disc stays small over the thumbnail corner; the pseudo
    // element bleeds past it to a 24px pointer target.
    "::after": {
      content: '""',
      insetBlock: `min(0px, calc((100% - ${vars["--aui-space-24"]}) / 2))`,
      insetInline: `min(0px, calc((100% - ${vars["--aui-space-24"]}) / 2))`,
      position: "absolute",
    },
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
  tokenMargin: { marginInline: vars["--aui-space-2"] },

  codeTitle: {
    minWidth: 0,
    gap: vars["--aui-space-8"],
  },
  codeLanguage: { flexShrink: 0 },
});
