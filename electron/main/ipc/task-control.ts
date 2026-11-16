import { FleetTaskControlArgsSchema, FleetTaskControlResultSchema, FleetStopChildrenResultSchema } from "../../../src/lib/fleet/host-control";
import { getDelegatedTaskCoordinator } from "../runs/delegated-task-coordinator-instance";
import { ensurePersistenceReady } from "../state";
import { ipcMain } from "electron";
import { z } from "zod";
import { prepareCraneTaskTakeover } from "../crane-connector/service";
import { stopManagedTask, takeOverManagedTask } from "../stave-mcp-service";

const TaskTakeOverArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    taskId: z.string().trim().min(1).max(256),
  })
  .strict();

export function registerTaskControlHandlers() {
  ipcMain.handle("task-control:delete-permanently", async (_event, raw: unknown) => {
    try {
      const args = FleetTaskControlArgsSchema.parse(raw);
      const store = await ensurePersistenceReady();
      store.removeTaskFromWorkspace({ ...args, permanently: true });
      return FleetTaskControlResultSchema.parse({ ok: true });
    } catch (error) {
      return FleetTaskControlResultSchema.parse({ ok: false, message: String(error).slice(0, 1000) });
    }
  });
  ipcMain.handle("task-control:stop-children", async (_event, raw: unknown) => {
    try {
      const args = FleetTaskControlArgsSchema.parse(raw);
      const store = await ensurePersistenceReady();
      const parent = store.loadWorkspaceShell({ workspaceId: args.workspaceId })?.tasks.find((task) => task.id === args.taskId);
      if (!parent) throw new Error("Task not found in the requested workspace.");
      const coordinator = getDelegatedTaskCoordinator();
      const children = await coordinator.list({ parentTaskId: args.taskId, includeFinished: false });
      const skipped: { taskId: string; reason: string }[] = [];
      let stopped = 0;
      for (const child of children) {
        const aggregate = store.getRunAggregate({ runId: child.runId, stepId: child.stepId });
        if (!aggregate) { skipped.push({ taskId: child.delegatedTaskId, reason: "not found" }); continue; }
        try {
          const result = await coordinator.stop({ parentTaskId: args.taskId, delegationKey: child.delegationKey });
          if (result.accepted) { stopped += 1; if (result.message) skipped.push({ taskId: child.delegatedTaskId, reason: result.message }); }
          else skipped.push({ taskId: child.delegatedTaskId, reason: result.message ?? result.reason ?? "refused" });
        } catch (error) { skipped.push({ taskId: child.delegatedTaskId, reason: String(error) }); }
      }
      return FleetStopChildrenResultSchema.parse({ ok: true, stopped, skipped });
    } catch (error) {
      return FleetStopChildrenResultSchema.parse({ ok: false, stopped: 0, skipped: [], message: String(error).slice(0, 1000) });
    }
  });

  ipcMain.handle("task-control:take-over", async (_event, args: unknown) => {
    const parsed = TaskTakeOverArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Invalid managed task takeover request.",
      };
    }
    try {
      const initialResult = await takeOverManagedTask(parsed.data);
      const crane = await prepareCraneTaskTakeover(parsed.data);
      const result =
        crane.sourceContexts.length > 0
          ? await takeOverManagedTask({
              ...parsed.data,
              sourceContexts: crane.sourceContexts,
            })
          : initialResult;
      return {
        ok: true,
        ...result,
        released: initialResult.released || result.released,
        craneReceiptPending: crane.receiptPending,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not take over the managed task.",
      };
    }
  });

  ipcMain.handle("task-control:stop", async (_event, args: unknown) => {
    const parsed = TaskTakeOverArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Invalid managed task stop request.",
      };
    }
    try {
      return {
        ok: true,
        ...(await stopManagedTask(parsed.data)),
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not stop the managed task.",
      };
    }
  });
}
