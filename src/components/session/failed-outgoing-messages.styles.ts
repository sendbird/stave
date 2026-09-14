import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const failedOutgoingMessagesStyles = stylex.create({
  // The outgoing bubble hugs its content at the same 88% cap as a normal user
  // message and stacks the body, status line, and actions.
  bubble: {
    alignItems: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
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
    "--message-bubble-bg": vars["--ads-color-danger-soft"],
    "--message-bubble-border-style": "solid",
    "--message-bubble-border-width": vars["--ads-border-width-hairline"],
    "--message-bubble-border-color": vars["--ads-color-danger-border"],
    "--message-bubble-gap": vars["--ads-space-8"],
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  attachmentSummary: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  statusRow: {
    alignItems: "center",
    color: vars["--ads-color-danger-text"],
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: 6,
    justifyContent: "flex-end",
    paddingInline: vars["--ads-space-4"],
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
    marginTop: vars["--ads-space-4"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingTop: vars["--ads-space-16"],
    width: "100%",
  },
});
