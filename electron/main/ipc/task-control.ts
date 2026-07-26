import { ipcMain } from "electron";
import { z } from "zod";
import { prepareCraneTaskTakeover } from "../crane-connector/service";
import { takeOverManagedTask } from "../stave-mcp-service";

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
      const crane = await prepareCraneTaskTakeover(parsed.data);
      const result = await takeOverManagedTask({
        ...parsed.data,
        sourceContexts: crane.sourceContexts,
      });
      return {
        ok: true,
        ...result,
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
}
