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
