/**
 * Renderer-facing CRUD for task heartbeats.
 *
 * Every handler forwards to `electron/main/task-supervisor-service.ts`, which
 * is the single main-process bridge to the supervisor running in the host
 * service. Nothing here throws across IPC: a rejected parse and a failed call
 * both come back as the same typed failure envelope the routines channels use,
 * so the renderer never has to distinguish an IPC error from a domain refusal.
 */
import { ipcMain } from "electron";
import {
  createTaskHeartbeat,
  listTaskHeartbeats,
  pauseTaskHeartbeat,
  removeTaskHeartbeat,
  resumeTaskHeartbeat,
  updateTaskHeartbeat,
} from "../task-supervisor-service";
import {
  TaskHeartbeatCreateArgsSchema,
  TaskHeartbeatIdArgsSchema,
  TaskHeartbeatListArgsSchema,
  TaskHeartbeatSetPausedArgsSchema,
  TaskHeartbeatUpdateArgsSchema,
} from "./schemas";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function emptySnapshot() {
  return { heartbeats: [], summaries: [] };
}

export function registerTaskHeartbeatHandlers() {
  ipcMain.handle("task-heartbeats:list", async (_event, args: unknown) => {
    const parsed = TaskHeartbeatListArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        snapshot: emptySnapshot(),
        message: "Invalid heartbeat query.",
      };
    }
    try {
      return { ok: true, snapshot: await listTaskHeartbeats(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        snapshot: emptySnapshot(),
        message: errorMessage(error, "Failed to load task heartbeats."),
      };
    }
  });

  ipcMain.handle("task-heartbeats:create", async (_event, args: unknown) => {
    const parsed = TaskHeartbeatCreateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, heartbeat: null, message: "Invalid heartbeat spec." };
    }
    try {
      return {
        ok: true,
        heartbeat: await createTaskHeartbeat(parsed.data.input),
      };
    } catch (error) {
      return {
        ok: false,
        heartbeat: null,
        message: errorMessage(error, "Failed to create the heartbeat."),
      };
    }
  });

  ipcMain.handle("task-heartbeats:update", async (_event, args: unknown) => {
    const parsed = TaskHeartbeatUpdateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        heartbeat: null,
        message: "Invalid heartbeat update.",
      };
    }
    try {
      return { ok: true, heartbeat: await updateTaskHeartbeat(parsed.data) };
    } catch (error) {
      return {
        ok: false,
        heartbeat: null,
        message: errorMessage(error, "Failed to update the heartbeat."),
      };
    }
  });

  ipcMain.handle(
    "task-heartbeats:set-paused",
    async (_event, args: unknown) => {
      const parsed = TaskHeartbeatSetPausedArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          heartbeat: null,
          message: "Invalid heartbeat update.",
        };
      }
      const { id, paused } = parsed.data;
      try {
        return {
          ok: true,
          heartbeat: paused
            ? await pauseTaskHeartbeat({ id })
            : await resumeTaskHeartbeat({ id }),
        };
      } catch (error) {
        return {
          ok: false,
          heartbeat: null,
          message: errorMessage(
            error,
            paused
              ? "Failed to pause the heartbeat."
              : "Failed to resume the heartbeat.",
          ),
        };
      }
    },
  );

  ipcMain.handle("task-heartbeats:remove", async (_event, args: unknown) => {
    const parsed = TaskHeartbeatIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid heartbeat id." };
    }
    try {
      const removed = await removeTaskHeartbeat(parsed.data);
      return { ok: true, id: removed.id };
    } catch (error) {
      return {
        ok: false,
        message: errorMessage(error, "Failed to remove the heartbeat."),
      };
    }
  });
}
