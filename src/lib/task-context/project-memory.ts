import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";
import {
  PROJECT_MEMORY_INJECTION_MAX_CHARS,
  capProjectMemoriesForInjection,
  formatProjectMemoryLine,
  type ProjectMemory,
} from "@/lib/project-memory";

export const STAVE_PROJECT_MEMORY_SOURCE_ID = "stave:project-memory";

const PROJECT_MEMORY_HEADER_LINES = [
  "Project memory (cross-workspace, agent- and user-maintained; human-authored AGENTS.md rules win on conflict):",
];

/**
 * The `stave:project-memory` retrieved-context block. Input is already ordered
 * by the store (query hits first, then confidence); this only renders and
 * applies the hard cap. Returns null when there is nothing to inject so the
 * block costs zero tokens in projects without memory.
 *
 * The body carries no timestamps or ids, so an idle turn's block stays
 * byte-identical and the per-session dedup can replace it with a pointer.
 */
export function buildProjectMemoryRetrievedContextPart(args: {
  memories: readonly Pick<ProjectMemory, "kind" | "content">[];
}): CanonicalRetrievedContextPart | null {
  // The cap is for the whole block: header lines count against it.
  const headerChars = PROJECT_MEMORY_HEADER_LINES.reduce(
    (total, line) => total + line.length + 1,
    0,
  );
  const kept = capProjectMemoriesForInjection(args.memories, {
    maxChars: PROJECT_MEMORY_INJECTION_MAX_CHARS - headerChars,
  });
  if (kept.length === 0) {
    return null;
  }
  return {
    type: "retrieved_context",
    sourceId: STAVE_PROJECT_MEMORY_SOURCE_ID,
    title: "Project Memory",
    content: [
      ...PROJECT_MEMORY_HEADER_LINES,
      ...kept.map((memory) => formatProjectMemoryLine(memory)),
    ].join("\n"),
  };
}

/**
 * Recall query for a task: its first user message when the history has one,
 * otherwise the prompt being sent (which on the first turn is that message).
 * Using the first message rather than the current prompt keeps the block
 * stable across a task's turns, which is what lets dedup drop it.
 */
export function resolveProjectMemoryRecallQuery(args: {
  history: readonly Pick<ChatMessage, "role" | "content">[];
  prompt: string;
}) {
  const firstUserMessage = args.history.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  return (firstUserMessage?.content ?? args.prompt).trim();
}
