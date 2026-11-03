import type { AssistantTraceEntry } from "./assistant-trace-builder";

/** Replay replaces changed parts; a new trace wrapper alone is not new work. */
export function sameAssistantTraceEntry(left: AssistantTraceEntry, right: AssistantTraceEntry): boolean {
  if (left === right) return true;
  if (left.kind !== right.kind || left.id !== right.id) return false;
  switch (left.kind) {
    case "reasoning":
      return right.kind === "reasoning" && left.isStreaming === right.isStreaming && sameParts(left.parts, right.parts);
    case "assistant_text":
      return right.kind === "assistant_text" && sameParts(left.parts, right.parts);
    case "diff":
      return right.kind === "diff" && sameParts(left.parts, right.parts);
    case "todo":
      return right.kind === "todo" && left.part === right.part && left.title === right.title;
    case "approval":
      return right.kind === "approval" && left.part === right.part && left.requestedBy === right.requestedBy;
    case "tool":
    case "subagent":
    case "user_input":
    case "system":
      return "part" in right && left.part === right.part;
  }
}

function sameParts(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}
