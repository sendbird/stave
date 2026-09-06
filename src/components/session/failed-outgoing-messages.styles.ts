import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const failedOutgoingMessagesStyles = stylex.create({
  // The outgoing bubble hugs its content at the same 88% cap as a normal user
  // message and stacks the body, status line, and actions.
  bubble: {
    alignItems: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    maxWidth: "88%",
    minWidth: 0,
    width: "fit-content",
  },
  // Destructive tint + border marks the message as unsent. `MessageContent`
  // renders its background/border from `--message-bubble-*` custom properties
  // published by `Message`; overriding those same properties here (rather than
  // the concrete `background-color`/`border-*`) wins the destructive surface
  // through the contract instead of by stylesheet order. The danger tokens are
  // theme-aware, so this reads correctly in light and dark.
  content: {
    "--message-bubble-bg": vars.colorDangerSoft,
    "--message-bubble-border-style": "solid",
    "--message-bubble-border-width": vars.borderWidthHairline,
    "--message-bubble-border-color": vars.colorDangerBorder,
    "--message-bubble-gap": vars.space8,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  attachmentSummary: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  statusRow: {
    alignItems: "center",
    color: vars.colorDangerText,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: 6,
    justifyContent: "flex-end",
    paddingInline: vars.space4,
  },
  statusIcon: {
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  statusText: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // `MessageActions` no longer declares its own margin, so this surface owns
  // the offset it wants: flush-left under the bubble with a small top gap.
  actions: {
    alignSelf: "flex-end",
    marginLeft: 0,
    marginTop: vars.space4,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
    paddingTop: vars.space16,
    width: "100%",
  },
});
