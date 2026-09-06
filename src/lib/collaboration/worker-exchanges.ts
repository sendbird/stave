import type { ChatMessage, MessagePart, ToolUsePart } from "@/types/chat";

export interface WorkerExchange {
  id: string;
  toolUseId?: string;
  /** Executing model when reported, otherwise Stave's resolved target. */
  model: string;
  requestedModel?: string;
  resolvedModel?: string;
  runtimeModel?: string;
  modelSource?: "explicit" | "preset" | "provider-default";
  modelRationale?: string;
  state: string;
  assignment: string;
  result: string;
  progress: readonly string[];
}
const MAX_EXCHANGES = 24;
const MAX_TEXT = 12000;

export function isWorkerExchangeToolPart(
  part: MessagePart,
): part is ToolUsePart {
  return (
    part.type === "tool_use" &&
    /(?:^|__|\.)stave_run_worker$|^Worker$/i.test(part.toolName)
  );
}

function brief(input: string): string {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed && typeof parsed === "object") {
      const value = parsed as Record<string, unknown>;
      return typeof value.task === "string"
        ? value.task.slice(0, MAX_TEXT)
        : typeof value.description === "string"
          ? value.description.slice(0, MAX_TEXT)
          : "Open the transcript for the original assignment.";
    }
  } catch {
    /* Streaming input is incomplete; never expose raw grant keys. */
  }
  return "Open the transcript for the original assignment.";
}
/** Project only top-level worker calls, not every nested tool carrying metadata. */
export function selectWorkerExchanges(
  messages: readonly ChatMessage[],
  maxExchanges = MAX_EXCHANGES,
): WorkerExchange[] {
  const rows: WorkerExchange[] = [];
  for (let i = messages.length - 1; i >= 0 && rows.length < maxExchanges; i--) {
    const message = messages[i]!;
    for (
      let j = message.parts.length - 1;
      j >= 0 && rows.length < maxExchanges;
      j--
    ) {
      const part = message.parts[j]!;
      if (!isWorkerExchangeToolPart(part)) continue;
      const execution = part.workerExecution;
      const resolvedModel =
        execution?.resolvedWorkerModel ?? execution?.workerModel;
      rows.push({
        id: `${message.id}:${part.toolUseId ?? j}`,
        toolUseId: part.toolUseId,
        model:
          execution?.runtimeWorkerModel ??
          resolvedModel ??
          "Model not reported",
        ...(execution?.requestedWorkerModel
          ? { requestedModel: execution.requestedWorkerModel }
          : {}),
        ...(resolvedModel ? { resolvedModel } : {}),
        ...(execution?.runtimeWorkerModel
          ? { runtimeModel: execution.runtimeWorkerModel }
          : {}),
        ...(execution?.workerModelSource
          ? { modelSource: execution.workerModelSource }
          : {}),
        ...(execution?.workerModelRationale
          ? { modelRationale: execution.workerModelRationale }
          : {}),
        state: part.state,
        assignment: brief(part.input),
        result: (part.output ?? "").slice(0, MAX_TEXT),
        progress: (part.progressMessages ?? [])
          .slice(-8)
          .map((p) => p.slice(0, 1000)),
      });
    }
  }
  return rows;
}
