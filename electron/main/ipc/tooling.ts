import { ipcMain } from "electron";
import { invokeHostService } from "../host-service-client";
import {
  SyncOriginMainArgsSchema,
  ToolingStatusArgsSchema,
} from "./schemas";
import {
  inspectWorkspaceSyncStatus,
} from "../utils/tooling-status";
import {
  getAppUpdateStatusSnapshot,
  scheduleAppUpdateInstallAndRestart,
} from "../utils/app-update";

export function registerToolingHandlers() {
  ipcMain.handle("tooling:get-status", async (_event, args: unknown) => {
    const parsed = ToolingStatusArgsSchema.safeParse(args);
    if (!parsed.success) {
      return invokeHostService("tooling.get-status", {});
    }
    return invokeHostService("tooling.get-status", parsed.data);
  });

  ipcMain.handle("tooling:sync-origin-main", async (_event, args: unknown) => {
    const parsed = SyncOriginMainArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        summary: "Invalid sync request.",
        detail: "The request did not match the expected workspace sync shape.",
        workspace: await inspectWorkspaceSyncStatus(),
      };
    }
    return invokeHostService("tooling.sync-origin-main", parsed.data);
  });

  ipcMain.handle("tooling:get-app-update-status", async () => {
    return getAppUpdateStatusSnapshot();
  });

  ipcMain.handle("tooling:install-app-update-and-restart", async () => {
    return scheduleAppUpdateInstallAndRestart();
  });
}
