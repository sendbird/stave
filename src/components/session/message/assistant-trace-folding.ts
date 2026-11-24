import type { ChatMessage } from "@/types/chat";
import { getTraceToolStep, type AssistantTraceEntry } from "./assistant-trace-builder";

/**
 * A request someone still has to answer never folds away. A pending file
 * change needs the trace only while the turn runs; afterwards the changed-file
 * block below the trace carries it.
 */
function awaitsDecision(entry: AssistantTraceEntry, isRunning: boolean): boolean {
  if (entry.kind === "approval") return entry.part.state === "approval-requested";
  return isRunning && entry.kind === "diff" && entry.parts.some((part) => part.status === "pending");
}

/**
 * The whole trace is history, kept in the order it happened. While a turn runs,
 * the collapsed trace still shows what steering needs: the latest interim
 * message and the subagents still working. Apart from pending decisions, a
 * finished turn shows no rows until the header opens. Tool failures stay on
 * their own rows inside the history.
 */
export function foldAssistantTrace(
  entries: readonly AssistantTraceEntry[],
  { isRunning, hasTrailingResponse }: { isRunning: boolean; hasTrailingResponse: boolean },
) {
  // Question cards already have their own position beside the trace.
  const history = entries.filter((entry) => entry.kind !== "user_input");
  const latestInterim = isRunning && !hasTrailingResponse
    ? history.findLast((entry) => entry.kind === "assistant_text")
    : undefined;
  const visible = history.filter((entry) =>
    awaitsDecision(entry, isRunning) || (isRunning && (
      entry === latestInterim ||
      (entry.kind === "subagent" && getTraceToolStep(entry)?.state !== "output-available")
    )));
  return { history, visible, stepCount: history.filter(getTraceToolStep).length };
}

export function getTraceElapsedMs(
  message: Pick<ChatMessage, "startedAt" | "completedAt">,
  nowMs?: number,
): number | undefined {
  const start = Date.parse(message.startedAt ?? "");
  const end = message.completedAt ? Date.parse(message.completedAt) : nowMs;
  return end !== undefined && Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? end - start
    : undefined;
}

/** Search indexes message prose and tool names. Match those same fields in trace order. */
export function findTraceSearchEntry(entries: readonly AssistantTraceEntry[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return;
  return entries.find((entry) => {
    const text = entry.kind === "assistant_text"
      ? entry.parts.map((part) => part.text).join("\n")
      : getTraceToolStep(entry)?.toolName;
    return text !== undefined && terms.every((term) => text.toLowerCase().includes(term));
  });
}
