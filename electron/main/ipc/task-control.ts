import { FleetArchiveArgsSchema, FleetArchiveResultSchema } from "../../../src/lib/fleet/host-control";
import { isTaskManaged } from "../../../src/lib/tasks";
import { findTarsResponsibility } from "../../../src/lib/tars/ownership";
import { FleetStopPreviewArgsSchema, FleetStopPreviewResultSchema } from "../../../src/lib/fleet/host-control";
import { stopFleetChildren } from "./fleet-stop-children";
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
  ipcMain.handle("task-control:archive", async (_event, raw: unknown) => {
    try {
      const args = FleetArchiveArgsSchema.parse(raw);
      return FleetArchiveResultSchema.parse((await ensurePersistenceReady()).archiveFleetTask(args));
    } catch {
      return FleetArchiveResultSchema.parse({ ok: false, reason: "failed" });
    }
  });
  ipcMain.handle("task-control:preview-stop", async (_event, raw: unknown) => {
    try {
      const args = FleetStopPreviewArgsSchema.parse(raw);
      const store = await ensurePersistenceReady();
      const result = store.previewFleetStop(args);
      const responsibilities = store.tars.snapshot().responsibilities;
      for (const item of result.items) {
        const task = store.loadWorkspaceShell({ workspaceId: item.workspaceId })?.tasks.find((candidate) => candidate.id === item.taskId);
        item.owned = Number(Boolean(task && (isTaskManaged({ controlMode: task.controlMode ?? "interactive" }) || findTarsResponsibility(responsibilities, item))));
      }
      result.owned = result.items.reduce((sum, item) => sum + item.owned, 0);
      return FleetStopPreviewResultSchema.parse(result);
    } catch {
      return FleetStopPreviewResultSchema.parse({ ok: false, turns: 0, children: 0, runs: 0, owned: 0, items: [], reason: "preview-failed" });
    }
  });
  ipcMain.handle("task-control:delete-permanently", async (_event, raw: unknown) => {
    try {
      const args = FleetTaskControlArgsSchema.parse(raw);
      const store = await ensurePersistenceReady();
      store.removeTaskFromWorkspace({ ...args, permanently: true });
      return FleetTaskControlResultSchema.parse({ ok: true });
    } catch (error) {
      return FleetTaskControlResultSchema.parse({ ok: false, reason: error instanceof z.ZodError ? "invalid-request" : "protected" });
    }
  });
  ipcMain.handle("task-control:stop-children", async (_event, raw: unknown) => {
    try {
      const args = FleetTaskControlArgsSchema.parse(raw);
      const store = await ensurePersistenceReady();
      return FleetStopChildrenResultSchema.parse(await stopFleetChildren(store, getDelegatedTaskCoordinator(), args));
    } catch (error) {
      return FleetStopChildrenResultSchema.parse({ ok: false, stopped: 0, skipped: [], reason: error instanceof z.ZodError ? "invalid-request" : "failed" });
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
