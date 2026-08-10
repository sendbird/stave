/**
 * Main-process bridge to the host service's task supervisor.
 *
 * Used by: `electron/main/stave-mcp-server.ts` (the `stave_*_task_heartbeat`
 * tools). The task UI reaches the same actions through `ipc/task-heartbeats.ts`.
 */
import type { HostTaskSupervisorAction } from "../host-service/protocol";
import type {
  TaskHeartbeat,
  TaskHeartbeatOccurrence,
  TaskHeartbeatUpsertInput,
} from "../../src/lib/automation/task-supervisor";
import type { TaskHeartbeatSnapshot } from "../host-service/task-supervisor-runtime";
import { invokeHostService } from "./host-service-client";

function invokeTaskSupervisor<TResult>(
  action: HostTaskSupervisorAction,
  args: unknown,
) {
  return invokeHostService("task-supervisor.invoke", {
    action,
    args,
  }) as Promise<TResult>;
}

export function listTaskHeartbeats(args: { workspaceId?: string } = {}) {
  return invokeTaskSupervisor<TaskHeartbeatSnapshot>("list", args);
}

export function getTaskHeartbeat(args: { id: string }) {
  return invokeTaskSupervisor<{
    heartbeat: TaskHeartbeat;
    occurrences: TaskHeartbeatOccurrence[];
  }>("get", args);
}

export function createTaskHeartbeat(input: TaskHeartbeatUpsertInput) {
  return invokeTaskSupervisor<TaskHeartbeat>("create", input);
}

export function updateTaskHeartbeat(args: {
  id: string;
  input: TaskHeartbeatUpsertInput;
}) {
  return invokeTaskSupervisor<TaskHeartbeat>("update", args);
}

export function pauseTaskHeartbeat(args: { id: string }) {
  return invokeTaskSupervisor<TaskHeartbeat>("pause", args);
}

export function resumeTaskHeartbeat(args: { id: string }) {
  return invokeTaskSupervisor<TaskHeartbeat>("resume", args);
}

export function removeTaskHeartbeat(args: { id: string }) {
  return invokeTaskSupervisor<{ ok: true; id: string }>("remove", args);
}
