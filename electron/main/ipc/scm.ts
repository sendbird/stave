import { ipcMain } from "electron";
import { invokeHostService } from "../host-service-client";
import { CreatePRArgsSchema, GetPrStatusByUrlArgsSchema } from "./schemas";

export function registerScmHandlers() {
  ipcMain.handle("scm:status", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.status", args),
  );

  ipcMain.handle("scm:stage-all", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.stage-all", args),
  );

  ipcMain.handle("scm:unstage-all", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.unstage-all", args),
  );

  ipcMain.handle(
    "scm:commit",
    (_event, args: { message: string; cwd?: string }) =>
      invokeHostService("scm.commit", args),
  );

  ipcMain.handle("scm:try-auto-fix-lint", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.try-auto-fix-lint", args),
  );

  ipcMain.handle(
    "scm:stage-file",
    (_event, args: { path: string; cwd?: string }) =>
      invokeHostService("scm.stage-file", args),
  );

  ipcMain.handle(
    "scm:unstage-file",
    (_event, args: { path: string; cwd?: string }) =>
      invokeHostService("scm.unstage-file", args),
  );

  ipcMain.handle(
    "scm:discard-file",
    (_event, args: { path: string; cwd?: string }) =>
      invokeHostService("scm.discard-file", args),
  );

  ipcMain.handle("scm:diff", (_event, args: { path: string; cwd?: string }) =>
    invokeHostService("scm.diff", args),
  );

  ipcMain.handle(
    "scm:history",
    (_event, args: { cwd?: string; limit?: number }) =>
      invokeHostService("scm.history", args),
  );

  ipcMain.handle(
    "scm:list-branches",
    (_event, args: { cwd?: string; refreshRemote?: boolean }) =>
      invokeHostService("scm.list-branches", args),
  );

  ipcMain.handle(
    "scm:create-branch",
    (_event, args: { name: string; cwd?: string; from?: string }) =>
      invokeHostService("scm.create-branch", args),
  );

  ipcMain.handle(
    "scm:checkout-branch",
    (_event, args: { name: string; cwd?: string }) =>
      invokeHostService("scm.checkout-branch", args),
  );

  ipcMain.handle(
    "scm:merge-branch",
    (_event, args: { branch: string; cwd?: string }) =>
      invokeHostService("scm.merge-branch", args),
  );

  ipcMain.handle(
    "scm:rebase-branch",
    (_event, args: { branch: string; cwd?: string }) =>
      invokeHostService("scm.rebase-branch", args),
  );

  ipcMain.handle(
    "scm:cherry-pick",
    (_event, args: { commit: string; cwd?: string }) =>
      invokeHostService("scm.cherry-pick", args),
  );

  ipcMain.handle("scm:get-pr-status", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.get-pr-status", args),
  );

  ipcMain.handle("scm:get-pr-status-for-url", (_event, args: unknown) => {
    const parsed = GetPrStatusByUrlArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, pr: null, stderr: "Invalid PR lookup request." };
    }
    return invokeHostService("scm.get-pr-status-for-url", parsed.data);
  });

  ipcMain.handle("scm:set-pr-ready", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.set-pr-ready", args),
  );

  ipcMain.handle(
    "scm:merge-pr",
    (_event, args: { method?: "merge" | "squash" | "rebase"; cwd?: string }) =>
      invokeHostService("scm.merge-pr", args),
  );

  ipcMain.handle("scm:update-pr-branch", (_event, args: { cwd?: string }) =>
    invokeHostService("scm.update-pr-branch", args),
  );

  ipcMain.handle("scm:create-pr", (_event, args: unknown) => {
    const parsed = CreatePRArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid create PR request." };
    }
    return invokeHostService("scm.create-pr", parsed.data);
  });
}
