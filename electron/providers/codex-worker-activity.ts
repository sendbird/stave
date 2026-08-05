import type { WorkerExecutionMetadata } from "../../src/lib/providers/worker-mode";
import type { BridgeEvent } from "./types";
import { truncateBufferedText } from "./provider-buffering";
import { isRecord } from "./codex-app-server-json";
import { toText } from "./utils";

type CollabToolCallItem = {
  id?: string;
  type?: string;
  tool?: string;
  status?: string;
  receiverThreadId?: string | null;
  receiverThreadIds?: string[] | null;
  newThreadId?: string | null;
  prompt?: string | null;
  agentStatus?: unknown;
  agentsStates?: unknown;
};

type SubAgentActivityItem = {
  id?: string;
  type?: string;
  kind?: string;
  agentThreadId?: string;
  agentPath?: string;
};

type MappingResult = { handled: boolean; events: BridgeEvent[] };

function serialize(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return toText(value ?? {});
  }
}

function truncate(value: string, maxBytes: number) {
  return truncateBufferedText({ value, maxBytes });
}

function buildCollabInput(
  item: CollabToolCallItem,
  workerExecution: WorkerExecutionMetadata | null,
  inputMaxBytes: number,
): Extract<BridgeEvent, { type: "tool" }> {
  const itemId = typeof item.id === "string" ? item.id : "";
  const toolName =
    typeof item.tool === "string" && item.tool.trim()
      ? item.tool.trim()
      : "collaboration";
  const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
  return {
    type: "tool",
    ...(itemId ? { toolUseId: itemId } : {}),
    toolName: `collaboration:${toolName}`,
    input: truncate(
      serialize({
        description: prompt.split("\n", 1)[0]?.slice(0, 160) || toolName,
        ...(prompt ? { prompt } : {}),
        ...(item.receiverThreadId
          ? { receiverThreadId: item.receiverThreadId }
          : {}),
        ...(item.receiverThreadIds
          ? { receiverThreadIds: item.receiverThreadIds }
          : {}),
        ...(item.newThreadId ? { newThreadId: item.newThreadId } : {}),
      }),
      inputMaxBytes,
    ),
    state: "input-available",
    ...(workerExecution && toolName === "spawn_agent"
      ? { workerExecution }
      : {}),
  };
}

function buildCollabResult(
  item: CollabToolCallItem,
): Extract<BridgeEvent, { type: "tool_result" }> {
  const result = {
    ...(item.receiverThreadId
      ? { receiverThreadId: item.receiverThreadId }
      : {}),
    ...(item.receiverThreadIds
      ? { receiverThreadIds: item.receiverThreadIds }
      : {}),
    ...(item.newThreadId ? { newThreadId: item.newThreadId } : {}),
    ...(item.agentStatus !== undefined
      ? { agentStatus: item.agentStatus }
      : {}),
    ...(item.agentsStates !== undefined
      ? { agentsStates: item.agentsStates }
      : {}),
  };
  return {
    type: "tool_result",
    tool_use_id: typeof item.id === "string" ? item.id : "",
    output:
      item.status === "failed" && Object.keys(result).length === 0
        ? "[error] Codex collaboration call failed."
        : serialize(result),
    ...(item.status === "failed" ? { isError: true } : {}),
  };
}

export function createCodexWorkerActivityMapper(args: {
  workerExecution: WorkerExecutionMetadata | null;
  inputMaxBytes: number;
  outputMaxBytes: number;
}) {
  const startedCollabIds = new Set<string>();
  const startedActivityIds = new Set<string>();
  const toolIdByChildThreadId = new Map<string, string>();

  return {
    ownsChildThread(threadId: string) {
      return toolIdByChildThreadId.has(threadId);
    },

    mapStarted(itemValue: unknown): MappingResult {
      if (!isRecord(itemValue)) return { handled: false, events: [] };
      if (itemValue.type === "subAgentActivity") {
        const item = itemValue as SubAgentActivityItem;
        if (item.kind !== "started") return { handled: true, events: [] };
        const itemId = typeof item.id === "string" ? item.id : "";
        if (!itemId || startedActivityIds.has(itemId)) {
          return { handled: true, events: [] };
        }
        startedActivityIds.add(itemId);
        if (item.agentThreadId) {
          toolIdByChildThreadId.set(item.agentThreadId, itemId);
        }
        const agentPath =
          typeof item.agentPath === "string" ? item.agentPath.trim() : "";
        const taskName =
          agentPath.split("/").filter(Boolean).at(-1) ?? "Worker";
        return {
          handled: true,
          events: [
            {
              type: "tool",
              toolUseId: itemId,
              toolName: "collaboration:spawn_agent",
              input: serialize({
                task_name: taskName,
                ...(item.agentThreadId
                  ? { agentThreadId: item.agentThreadId }
                  : {}),
              }),
              state: "input-available",
              ...(args.workerExecution
                ? { workerExecution: args.workerExecution }
                : {}),
            },
          ],
        };
      }
      if (
        itemValue.type !== "collabToolCall" &&
        itemValue.type !== "collabAgentToolCall"
      ) {
        return { handled: false, events: [] };
      }
      const item = itemValue as CollabToolCallItem;
      const itemId = typeof item.id === "string" ? item.id : "";
      if (!itemId || startedCollabIds.has(itemId)) {
        return { handled: true, events: [] };
      }
      startedCollabIds.add(itemId);
      return {
        handled: true,
        events: [
          buildCollabInput(item, args.workerExecution, args.inputMaxBytes),
        ],
      };
    },

    mapCompleted(itemValue: unknown): MappingResult {
      if (!isRecord(itemValue)) return { handled: false, events: [] };
      if (itemValue.type === "subAgentActivity") {
        return { handled: true, events: [] };
      }
      if (
        itemValue.type !== "collabToolCall" &&
        itemValue.type !== "collabAgentToolCall"
      ) {
        return { handled: false, events: [] };
      }
      const item = itemValue as CollabToolCallItem;
      const itemId = typeof item.id === "string" ? item.id : "";
      return {
        handled: true,
        events: [
          ...(!itemId || !startedCollabIds.delete(itemId)
            ? [buildCollabInput(item, args.workerExecution, args.inputMaxBytes)]
            : []),
          buildCollabResult(item),
        ],
      };
    },

    mapForeignNotification(input: {
      method: string;
      threadId: string;
      params: Record<string, unknown>;
    }): MappingResult {
      const toolUseId = toolIdByChildThreadId.get(input.threadId);
      if (!toolUseId) return { handled: false, events: [] };
      if (input.method === "item/completed") {
        const item = isRecord(input.params.item) ? input.params.item : null;
        const text = typeof item?.text === "string" ? item.text : "";
        if (item?.type === "agentMessage" && text) {
          if (item.phase !== undefined && item.phase !== "final_answer") {
            return {
              handled: true,
              events: [
                {
                  type: "subagent_progress",
                  toolUseId,
                  content: truncate(text, args.inputMaxBytes),
                },
              ],
            };
          }
          toolIdByChildThreadId.delete(input.threadId);
          return {
            handled: true,
            events: [
              {
                type: "tool_result",
                tool_use_id: toolUseId,
                output: truncate(text, args.outputMaxBytes),
              },
            ],
          };
        }
      }
      if (input.method === "turn/completed") {
        const turn = isRecord(input.params.turn) ? input.params.turn : null;
        const status = typeof turn?.status === "string" ? turn.status : "";
        if (status && status !== "completed") {
          toolIdByChildThreadId.delete(input.threadId);
          return {
            handled: true,
            events: [
              {
                type: "tool_result",
                tool_use_id: toolUseId,
                output: `[error] Worker turn ${status}.`,
                isError: true,
              },
            ],
          };
        }
      }
      return { handled: true, events: [] };
    },
  };
}
