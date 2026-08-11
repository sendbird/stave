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

/**
 * The child thread id a collaboration item directly names, when it names
 * exactly one. `receiverThreadIds` (plural) is a broadcast and identifies no
 * single agent, so it is deliberately ignored here.
 */
function readCollabChildThreadId(item: CollabToolCallItem) {
  const candidate =
    (typeof item.newThreadId === "string" ? item.newThreadId.trim() : "") ||
    (typeof item.receiverThreadId === "string"
      ? item.receiverThreadId.trim()
      : "");
  return candidate || "";
}

function buildCollabInput(
  item: CollabToolCallItem,
  workerExecution: WorkerExecutionMetadata | null,
  inputMaxBytes: number,
  identity: {
    agentId: string;
    parentToolUseId: string;
  },
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
    ...(identity.agentId ? { agentId: identity.agentId } : {}),
    ...(identity.parentToolUseId
      ? { parentToolUseId: identity.parentToolUseId }
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
  // Both directions of the same link. They are written and cleared together by
  // `linkChildThread` / `unlinkChildThread` so neither entry can outlive its
  // sibling.
  const toolIdByChildThreadId = new Map<string, string>();
  const childThreadIdByToolId = new Map<string, string>();

  function linkChildThread(childThreadId: string, toolUseId: string) {
    if (!childThreadId || !toolUseId) return;
    const previousToolUseId = toolIdByChildThreadId.get(childThreadId);
    if (previousToolUseId && previousToolUseId !== toolUseId) {
      childThreadIdByToolId.delete(previousToolUseId);
    }
    toolIdByChildThreadId.set(childThreadId, toolUseId);
    childThreadIdByToolId.set(toolUseId, childThreadId);
  }

  function unlinkChildThread(childThreadId: string) {
    const toolUseId = toolIdByChildThreadId.get(childThreadId);
    toolIdByChildThreadId.delete(childThreadId);
    if (toolUseId) childThreadIdByToolId.delete(toolUseId);
  }

  function buildCollabIdentity(item: CollabToolCallItem) {
    const childThreadId = readCollabChildThreadId(item);
    if (!childThreadId) return { agentId: "", parentToolUseId: "" };
    const itemId = typeof item.id === "string" ? item.id : "";
    const parentToolUseId = toolIdByChildThreadId.get(childThreadId) ?? "";
    return {
      agentId: childThreadId,
      // Never let a tool call claim itself as its own parent.
      parentToolUseId: parentToolUseId === itemId ? "" : parentToolUseId,
    };
  }

  return {
    ownsChildThread(threadId: string) {
      return toolIdByChildThreadId.has(threadId);
    },

    /**
     * The child thread id (Codex's `agentThreadId`) a tool-use id spawned, when
     * one is known. A tool-use id is never an agent id, so callers must resolve
     * it here instead of reusing the item id.
     */
    agentIdForToolUseId(toolUseId: string) {
      return childThreadIdByToolId.get(toolUseId);
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
        const agentThreadId =
          typeof item.agentThreadId === "string"
            ? item.agentThreadId.trim()
            : "";
        if (agentThreadId) {
          linkChildThread(agentThreadId, itemId);
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
                ...(agentThreadId ? { agentThreadId } : {}),
              }),
              state: "input-available",
              ...(args.workerExecution
                ? { workerExecution: args.workerExecution }
                : {}),
              ...(agentThreadId ? { agentId: agentThreadId } : {}),
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
          buildCollabInput(
            item,
            args.workerExecution,
            args.inputMaxBytes,
            buildCollabIdentity(item),
          ),
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
            ? [
                buildCollabInput(
                  item,
                  args.workerExecution,
                  args.inputMaxBytes,
                  buildCollabIdentity(item),
                ),
              ]
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
      // The foreign thread id *is* Codex's `agentThreadId` for this worker.
      const agentId = input.threadId;
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
                  ...(agentId ? { agentId } : {}),
                },
              ],
            };
          }
          unlinkChildThread(input.threadId);
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
          unlinkChildThread(input.threadId);
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
