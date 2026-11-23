import type { ChatMessage } from "@/types/chat";
import { getTraceToolStep, type AssistantTraceEntry } from "./assistant-trace-builder";
import { isTraceToolFailure } from "./turn-event-state";

const SHORT_TRACE_STEP_LIMIT = 3;

export function foldAssistantTrace(
  entries: readonly AssistantTraceEntry[],
  { isRunning, hasTrailingResponse }: { isRunning: boolean; hasTrailingResponse: boolean },
) {
  const stepCount = entries.filter(getTraceToolStep).length;
  const latestInterim = isRunning && !hasTrailingResponse
    ? entries.findLast((entry) => entry.kind === "assistant_text")
    : undefined;
  const history: AssistantTraceEntry[] = [];
  const visible: AssistantTraceEntry[] = [];
  let foldedStepCount = 0;
  let failureCount = 0;

  for (const entry of entries) {
    // Question cards already have their own position beside the trace.
    if (entry.kind === "user_input") continue;
    const tool = getTraceToolStep(entry);
    const failed = tool !== undefined && isTraceToolFailure(tool);
    if (failed) failureCount += 1;
    const finishedStep = tool?.state === "output-available" && !failed && entry.kind !== "subagent";
    if (stepCount > SHORT_TRACE_STEP_LIMIT && (
      finishedStep ||
      (entry.kind === "assistant_text" && entry !== latestInterim) ||
      (entry.kind === "reasoning" && (!isRunning || !entry.isStreaming))
    )) {
      history.push(entry);
      if (finishedStep) foldedStepCount += 1;
    } else {
      visible.push(entry);
    }
  }
  return { history, visible, foldedStepCount, failureCount };
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
