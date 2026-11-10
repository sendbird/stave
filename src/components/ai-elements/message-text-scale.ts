import { createContext, useContext, type CSSProperties } from "react";

/**
 * Where a message body renders. `conversation` follows the user's message and
 * code font sizes as set; `panel` caps them at the panel's body and caption
 * steps, so an answer quoted in a ~384px side panel (a run's final answer, a
 * subagent's answer) reads like the conversation without the conversation's
 * reading size.
 */
export type MessageTextScale = "conversation" | "panel";

/** `--aui-font-size-body`, in px. */
export const PANEL_MESSAGE_FONT_SIZE_MAX = 14;
/** `--aui-font-size-caption`, in px. */
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

/**
 * The type scale's steps below `body`, as ratios of it: the AUI scale's
 * 16 → 14 → 12 steps (`--aui-font-size-lead` → `body` → `caption`).
 */
export const CHAT_TYPE_SECONDARY_RATIO = 14 / 16;
export const CHAT_TYPE_META_RATIO = 12 / 16;
/** The reply's line-height ratio (`--chat-type-body-leading`). */
export const CHAT_BODY_LINE_HEIGHT = 1.55;

/** The three sizes of the conversation's type scale for one chat font size, in whole px. */
export function chatTypeScale(body: number) {
  return {
    body,
    secondary: Math.round(body * CHAT_TYPE_SECONDARY_RATIO),
    meta: Math.round(body * CHAT_TYPE_META_RATIO),
  };
}

/**
 * The inline style a host sets so every descendant reads the scale for its
 * chat font size (`chat-type.stylex.ts`). Secondary and meta never go below
 * the AUI caption and micro steps.
 */
export function chatTypeScaleVars(body: number): CSSProperties {
  const scale = chatTypeScale(body);
  return {
    "--chat-type-body": `${scale.body}px`,
    "--chat-type-secondary": `max(var(--aui-font-size-caption), ${scale.secondary}px)`,
    "--chat-type-meta": `max(var(--aui-font-size-micro), ${scale.meta}px)`,
  } as CSSProperties;
}
