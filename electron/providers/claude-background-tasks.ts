import { randomUUID } from "node:crypto";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  BACKGROUND_TASK_LIMIT,
  canStopBackgroundTask,
  type BackgroundTaskEvent,
  type BackgroundTaskRequest,
  type BackgroundTaskResponse,
} from "../../src/lib/providers/background-tasks";
import { readClaudeBackgroundTail } from "./claude-background-output";
import type { StreamTurnArgs, BridgeEvent } from "./types";

type TurnOwner = Pick<BackgroundTaskRequest, "workspaceId" | "taskId" | "turnId">;
type RequestHandler = (request: BackgroundTaskRequest) => Promise<BackgroundTaskResponse>;
type ObservedTask = {
  event: BackgroundTaskEvent;
  runId?: string;
  file?: string;
  stopping?: boolean;
};

const handlers = new Map<string, RequestHandler>();
const turnKey = ({ workspaceId, taskId, turnId }: TurnOwner) => JSON.stringify([workspaceId, taskId, turnId]);

export function requestClaudeBackgroundTask(request: BackgroundTaskRequest): Promise<BackgroundTaskResponse> {
  return handlers.get(turnKey(request))?.(request) ?? Promise.resolve({ ok: false });
}

function isActive(row: BackgroundTaskEvent) {
  return row.status === "running" || row.status === "paused";
}

function terminalStatus(status: string | undefined): "completed" | "failed" | "stopped" | undefined {
  if (status === "completed" || status === "failed" || status === "stopped") return status;
  return status === "killed" ? "stopped" : undefined;
}

/**
 * Consumes Claude-native background evidence while the SDK query owns its
 * tasks. Codex command items expose ordinary tool execution but do not expose
 * this background lifecycle or a task-scoped control handle.
 */
export function trackClaudeBackgroundTasks(args: {
  owner?: TurnOwner;
  readOnly?: boolean;
  getQuery: () => Pick<Query, "stopTask"> | null | undefined;
  emit: (event: BackgroundTaskEvent) => void;
  now?: () => number;
}) {
  const now = args.now ?? Date.now;
  const nativeTasks = new Map<string, ObservedTask>();
  const nativeTools = new Map<string, { name: string; description: string }>();
  let sessionId: string | undefined;
  let active = true;
  let controlsOpen = true;
  const hasStopHandle = () => controlsOpen && !!args.owner && !args.readOnly && typeof args.getQuery()?.stopTask === "function";

  function update(task: ObservedTask, patch: Partial<BackgroundTaskEvent>) {
    const next = { ...task.event, ...patch };
    if (Object.keys(patch).every((key) => next[key as keyof BackgroundTaskEvent] === task.event[key as keyof BackgroundTaskEvent])) return;
    task.event = next;
    args.emit(next);
  }

  function observeTask(
    nativeId: string, runId: string | undefined, description: string, confirmed: boolean,
  ): ObservedTask | undefined {
    if (typeof nativeId !== "string" || !nativeId || nativeId.length > 200) return;
    let task = nativeTasks.get(nativeId);
    if (task?.runId && runId && runId < task.runId) return;
    if (!task || (task.runId && runId && task.runId < runId)) {
      if (task && isActive(task.event)) {
        update(task, { status: "unknown", endedAt: now(), confidence: "inferred", canStop: false });
      }
      task = {
        runId,
        event: {
          type: "background_task", id: randomUUID(), providerId: "claude-code",
          description: description.slice(0, 512), startedAt: now(), status: "running",
          confidence: confirmed ? "confirmed" : "inferred",
          canStop: confirmed && hasStopHandle(),
          hasOutput: false,
        },
      };
      nativeTasks.set(nativeId, task);
      if (nativeTasks.size > BACKGROUND_TASK_LIMIT) {
        const oldest = [...nativeTasks].find(([, item]) => !isActive(item.event)) ?? nativeTasks.entries().next().value;
        if (oldest) nativeTasks.delete(oldest[0]);
      }
      args.emit(task.event);
    } else if (confirmed && !terminalStatus(task.event.status)) {
      task.runId ??= runId;
      update(task, {
        description: description.slice(0, 512) || task.event.description,
        status: task.event.status === "paused" ? "paused" : "running",
        endedAt: undefined,
        confidence: "confirmed",
        canStop: !task.stopping && hasStopHandle(),
      });
    }
    return task;
  }

  if (args.owner) {
    handlers.set(turnKey(args.owner), async (request) => {
      const found = [...nativeTasks].find(([, task]) => task.event.id === request.id);
      if (!active || !found || !sessionId) return { ok: false };
      const [nativeId, task] = found;
      if (request.operation === "read") {
        const output = task.file ? await readClaudeBackgroundTail(task.file, sessionId, nativeId) : undefined;
        return active && nativeTasks.get(nativeId) === task ? { ok: true, output } : { ok: false };
      }
      const query = args.getQuery();
      if (!query || !hasStopHandle() || task.stopping || !canStopBackgroundTask(task.event, active)) {
        return { ok: false };
      }
      task.stopping = true;
      try {
        await query.stopTask(nativeId);
        return { ok: true };
      } catch {
        task.stopping = false;
        return { ok: false };
      }
    });
  }

  return {
    async observe(message: SDKMessage) {
      if (!active) return;
      if (message.type === "result") {
        // The runtime closes the SDK input after result. It may still receive
        // notifications during wind-down, but control requests no longer land.
        controlsOpen = false;
        for (const task of nativeTasks.values()) update(task, { canStop: false });
        return;
      }
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }
      if (message.type === "system" && message.subtype === "background_tasks_changed") {
        sessionId ??= message.session_id;
        if (message.session_id !== sessionId || !Array.isArray(message.tasks)) return;
        const liveIds = new Set<string>();
        for (const task of message.tasks) {
          if (task.ambient || typeof task.description !== "string") continue;
          liveIds.add(task.task_id);
          observeTask(task.task_id, task.run_id, task.description, true);
        }
        for (const [id, task] of nativeTasks) {
          if (isActive(task.event) && !liveIds.has(id)) {
            update(task, { status: "unknown", endedAt: now(), confidence: "inferred", canStop: false });
          }
        }
        return;
      }
      if (message.type === "system" && (message.subtype === "task_started" || message.subtype === "task_updated" || message.subtype === "task_notification")) {
        sessionId ??= message.session_id;
        if (message.session_id !== sessionId) return;
        if (message.subtype === "task_started") {
          if (!message.ambient && message.is_backgrounded === true) {
            observeTask(message.task_id, message.run_id, message.description ?? "", true);
          }
          return;
        }
        if (message.subtype === "task_updated" && message.patch.is_backgrounded === true) {
          observeTask(message.task_id, message.run_id, message.patch.description ?? "", true);
        }
        const task = nativeTasks.get(message.task_id);
        if (!task || (message.run_id && task.runId && message.run_id !== task.runId)) return;
        const status = terminalStatus(message.subtype === "task_notification" ? message.status : message.patch.status);
        if (status) {
          const endedAt = message.subtype === "task_updated" ? message.patch.end_time : undefined;
          update(task, {
            status, endedAt: Math.max(task.event.startedAt, endedAt ?? task.event.endedAt ?? now()),
            confidence: "confirmed", canStop: false,
          });
          const file = message.subtype === "task_notification" ? message.output_file : task.file;
          if (file && sessionId) {
            const finalOutput = await readClaudeBackgroundTail(file, sessionId, message.task_id);
            if (active && finalOutput) update(task, { finalOutput });
          }
        } else if (message.subtype === "task_updated" && !terminalStatus(task.event.status)) {
          if (message.patch.is_backgrounded === false) {
            update(task, { status: "unknown", endedAt: now(), confidence: "inferred", canStop: false });
          } else if (isActive(task.event) && (message.patch.status === "paused" || message.patch.status === "running")) {
            update(task, { status: message.patch.status, confidence: "confirmed" });
          }
        }
        return;
      }
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type !== "tool_use" || (block.name !== "Bash" && block.name !== "Monitor")) continue;
          const input = block.input as { description?: unknown; command?: unknown } | undefined;
          const description = typeof input?.description === "string" ? input.description : input?.command;
          nativeTools.set(block.id, { name: block.name, description: typeof description === "string" ? description.slice(0, 512) : "" });
          if (nativeTools.size > 128) {
            const oldest = nativeTools.keys().next().value;
            if (oldest !== undefined) nativeTools.delete(oldest);
          }
        }
        return;
      }
      if (message.type !== "user" || !Array.isArray(message.message.content)) return;
      const result = message.tool_use_result as { backgroundTaskId?: unknown; taskId?: unknown } | undefined;
      if (!result || (typeof result.backgroundTaskId !== "string" && typeof result.taskId !== "string")) return;
      for (const block of message.message.content) {
        if (block.type !== "tool_result" || block.is_error) continue;
        const tool = nativeTools.get(block.tool_use_id);
        const nativeId = tool?.name === "Bash" ? result.backgroundTaskId : tool?.name === "Monitor" ? result.taskId : undefined;
        if (typeof nativeId !== "string") continue;
        sessionId ??= message.session_id;
        if (message.session_id !== sessionId) return;
        const task = observeTask(nativeId, undefined, tool?.description ?? "", false);
        // The bundled CLI includes an output path in the launch receipt. Join
        // it to the structured task ID and validate its location when reading.
        const receipt = typeof block.content === "string" ? block.content : "";
        const prefix = `Command running in background with ID: ${nativeId}. Output is being written to: `;
        const suffix = ". You will be notified when it completes.";
        const end = receipt.indexOf(suffix, prefix.length);
        if (task && receipt.startsWith(prefix) && end !== -1) {
          task.file = receipt.slice(prefix.length, end);
          update(task, { hasOutput: true });
        }
      }
    },
    close() {
      active = false;
      if (args.owner) handlers.delete(turnKey(args.owner));
    },
  };
}


export function createClaudeBackgroundTaskObserver(
  args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void },
  getQuery: () => Query | null,
  collector: { append: (event: BridgeEvent) => unknown },
) {
  const { workspaceId, taskId, turnId } = args;
  return trackClaudeBackgroundTasks({
    owner: workspaceId && taskId && turnId ? { workspaceId, taskId, turnId } : undefined,
    readOnly: args.managedTask,
    getQuery,
    emit(event) {
      collector.append(event);
      args.onEvent?.(event);
    },
  });
}
