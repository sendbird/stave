/** Pure rules behind find in conversation: what matches, where a step lands, which keydown opens it. */

/** Attribute on the chat area: Cmd/Ctrl+F anywhere inside it (composer included) finds in its transcript. */
export const CONVERSATION_FIND_SCOPE_ATTRIBUTE = "data-conversation-find-scope";

interface FindableMessage {
  content: string;
  parts: ReadonlyArray<{ type: string; text?: string }>;
}

/** Searchable text of a message: its text parts, else its content. Tool and thinking parts are skipped. */
function findableText(message: FindableMessage) {
  const textParts = message.parts.filter((part) => part.type === "text");
  return textParts.length
    ? textParts.map((part) => part.text ?? "").join("\n")
    : message.content;
}

/** Indexes of the messages whose text contains `query`, case-insensitively. */
export function findMatchingMessageIndexes(
  messages: ReadonlyArray<FindableMessage>,
  query: string,
): number[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return messages.flatMap((message, index) =>
    findableText(message).toLocaleLowerCase().includes(needle) ? [index] : [],
  );
}

/** The next position among `total` matches, wrapping at both ends; -1 means none chosen yet. */
export function stepFindPosition(current: number, total: number, backward: boolean) {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) return backward ? total - 1 : 0;
  return (current + (backward ? -1 : 1) + total) % total;
}

/**
 * Whether a Cmd/Ctrl+F keydown belongs to the transcript tagged `scopeId`:
 * focus sits inside the same chat area (transcript, composer, or the area
 * itself after a click on message text), and not in a terminal or editor that
 * owns its own find.
 */
export function isConversationFindShortcut(event: KeyboardEvent, scopeId: string) {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return false;
  const target = event.target;
  if (!(target instanceof Element) || target.closest(".xterm, .monaco-editor")) return false;
  const panel = target.closest("[data-chat-panel]");
  if (panel) return panel.getAttribute("data-chat-panel") === scopeId;
  const area = target.closest(`[${CONVERSATION_FIND_SCOPE_ATTRIBUTE}]`);
  return area?.querySelector("[data-chat-panel]")?.getAttribute("data-chat-panel") === scopeId;
}
