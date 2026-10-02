import { createContext, useContext } from "react";

/**
 * Where a message body renders. `conversation` follows the user's message and
 * code font sizes as set; `panel` caps them at the panel's body and caption
 * steps, so an answer quoted in a ~384px side panel (a run's final answer, a
 * subagent's answer) reads like the conversation without the conversation's
 * reading size.
 */
export type MessageTextScale = "conversation" | "panel";

/** `--ads-font-size-body`, in px. */
export const PANEL_MESSAGE_FONT_SIZE_MAX = 14;
/** `--ads-font-size-caption`, in px. */
export const PANEL_MESSAGE_CODE_FONT_SIZE_MAX = 12;

export const MessageTextScaleContext =
  createContext<MessageTextScale>("conversation");

export function useMessageTextScale(): MessageTextScale {
  return useContext(MessageTextScaleContext);
}

/** The body font size for a scale; a smaller user setting always wins. */
export function scaleMessageFontSize(scale: MessageTextScale, size: number) {
  return scale === "panel" ? Math.min(size, PANEL_MESSAGE_FONT_SIZE_MAX) : size;
}

/** The code font size for a scale; a smaller user setting always wins. */
export function scaleMessageCodeFontSize(
  scale: MessageTextScale,
  size: number,
) {
  return scale === "panel"
    ? Math.min(size, PANEL_MESSAGE_CODE_FONT_SIZE_MAX)
    : size;
}
