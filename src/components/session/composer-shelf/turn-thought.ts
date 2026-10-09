import type { ChatMessage } from "@/types/chat";

/**
 * The latest thing the agent said it was thinking, as one short plain-text
 * line for the run line. Tool names say what the agent does; this says why,
 * which is what lets a reader stop a turn that is heading the wrong way.
 *
 * used by: `TurnRunLine.tsx`, `tests/turn-thought.test.ts`.
 */

export const TURN_THOUGHT_MAX_CHARS = 240;

/**
 * Reasoning arrives as markdown, often a bold heading and then paragraphs.
 * The newest paragraph is the current thought; formatting marks are dropped
 * and long text is cut on a word.
 */
export function summarizeTurnThought(text: string): string | null {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const latest = paragraphs.at(-1);
  if (!latest) return null;
  const plain = latest
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  if (plain.length <= TURN_THOUGHT_MAX_CHARS) return plain;
  const cut = plain.slice(0, TURN_THOUGHT_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > TURN_THOUGHT_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The live turn's newest reasoning, or null. Only the streaming reply counts:
 * a finished turn's thinking is history and stays in the trace.
 */
export function selectLatestTurnThought(messages: readonly ChatMessage[] | undefined): string | null {
  const last = messages?.at(-1);
  if (!last || last.role !== "assistant" || !last.isStreaming) return null;
  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index];
    if (part?.type === "thinking") return summarizeTurnThought(part.text);
  }
  return null;
}
