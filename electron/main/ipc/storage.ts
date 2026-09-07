import { ipcMain } from "electron";
import {
  collectStorageCleanupReport,
  runStorageCleanup,
} from "../storage-cleanup";
import { StorageCleanupArgsSchema } from "./schemas";

export function registerStorageHandlers() {
  ipcMain.handle("storage:get-cleanup-report", async () => {
    try {
      return { ok: true, report: await collectStorageCleanupReport() };
    } catch (error) {
      return { ok: false, report: null, error: String(error) };
    }
  });

  ipcMain.handle("storage:run-cleanup", async (_event, args: unknown) => {
    const parsed = StorageCleanupArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, result: null, error: "invalid arguments" };
    }
    try {
      return { ok: true, result: await runStorageCleanup(parsed.data) };
    } catch (error) {
      return { ok: false, result: null, error: String(error) };
    }
  });
}
