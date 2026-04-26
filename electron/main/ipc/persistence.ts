import { ipcMain } from "electron";
import type { PersistenceWorkspaceSnapshot } from "../../persistence/types";
import {
  CreateNotificationArgsSchema,
  LoadWorkspaceEditorTabBodiesArgsSchema,
  ListActiveWorkspaceTurnsArgsSchema,
  LoadTaskMessagesArgsSchema,
  ListLatestWorkspaceTurnsArgsSchema,
  ListNotificationsArgsSchema,
  ListTaskTurnsArgsSchema,
  MarkAllNotificationsReadArgsSchema,
  MarkNotificationReadArgsSchema,
  PersistenceUpsertArgsSchema,
  SaveProjectRegistryArgsSchema,
  WorkspaceIdArgsSchema,
} from "./schemas";
import {
  ensurePersistenceReady,
  ensurePersistenceReadySync,
  getPersistenceBootstrapStatus,
} from "../state";

export function registerPersistenceHandlers() {
  ipcMain.handle("persistence:get-bootstrap-status", async () => {
    return getPersistenceBootstrapStatus();
  });

  ipcMain.handle("persistence:list-workspaces", async () => {
    const store = await ensurePersistenceReady();
    const rows = store.listWorkspaceSummaries();
    return { ok: true, rows };
  });

  ipcMain.handle("persistence:load-workspace", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, snapshot: null };
    }
    const store = await ensurePersistenceReady();
    const snapshot = store.loadWorkspaceSnapshot({ workspaceId: parsedArgs.data.workspaceId });
    return { ok: true, snapshot };
  });

  ipcMain.handle("persistence:load-workspace-shell", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, shell: null };
    }
    const store = await ensurePersistenceReady();
    const shell = store.loadWorkspaceShell({ workspaceId: parsedArgs.data.workspaceId });
    return { ok: true, shell };
  });

  ipcMain.handle("persistence:load-workspace-shell-for-restore", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, shell: null };
    }
    const store = await ensurePersistenceReady();
    const shell = store.loadWorkspaceShellForRestore({
      workspaceId: parsedArgs.data.workspaceId,
    });
    return { ok: true, shell };
  });

  ipcMain.handle("persistence:load-workspace-shell-lite", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, shellLite: null };
    }
    const store = await ensurePersistenceReady();
    const shellLite = store.loadWorkspaceShellLite({
      workspaceId: parsedArgs.data.workspaceId,
    });
    return { ok: true, shellLite };
  });

  ipcMain.handle("persistence:load-workspace-shell-summary", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, summary: null };
    }
    const store = await ensurePersistenceReady();
    const summary = store.loadWorkspaceShellSummary({
      workspaceId: parsedArgs.data.workspaceId,
    });
    return { ok: true, summary };
  });

  ipcMain.handle("persistence:load-task-messages", async (_event, args: unknown) => {
    const parsedArgs = LoadTaskMessagesArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, page: null };
    }
    const store = await ensurePersistenceReady();
    const page = store.loadTaskMessagesPage(parsedArgs.data);
    return { ok: true, page };
  });

  ipcMain.handle("persistence:load-workspace-editor-tab-bodies", async (_event, args: unknown) => {
    const parsedArgs = LoadWorkspaceEditorTabBodiesArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, bodies: [] };
    }
    const store = await ensurePersistenceReady();
    const bodies = store.loadWorkspaceEditorTabBodies(parsedArgs.data);
    return { ok: true, bodies };
  });

  ipcMain.handle("persistence:load-project-registry", async () => {
    const store = await ensurePersistenceReady();
    const projects = store.loadProjectRegistry();
    return { ok: true, projects };
  });

  ipcMain.handle("persistence:upsert-workspace", async (_event, args: unknown) => {
    const parsedArgs = PersistenceUpsertArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false };
    }
    const store = await ensurePersistenceReady();
    store.upsertWorkspace({
      id: parsedArgs.data.id,
      name: parsedArgs.data.name,
      snapshot: parsedArgs.data.snapshot as PersistenceWorkspaceSnapshot,
    });
    return { ok: true };
  });

  ipcMain.handle("persistence:save-project-registry", async (_event, args: unknown) => {
    const parsedArgs = SaveProjectRegistryArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false };
    }
    const store = await ensurePersistenceReady();
    store.saveProjectRegistry({
      projects: parsedArgs.data.projects as never[],
    });
    return { ok: true };
  });

  ipcMain.on("persistence:upsert-workspace-sync", (event, args: unknown) => {
    const parsedArgs = PersistenceUpsertArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      event.returnValue = { ok: false, message: "Invalid workspace persistence request." };
      return;
    }
    try {
      const store = ensurePersistenceReadySync();
      store.upsertWorkspace({
        id: parsedArgs.data.id,
        name: parsedArgs.data.name,
        snapshot: parsedArgs.data.snapshot as PersistenceWorkspaceSnapshot,
      });
      event.returnValue = { ok: true };
    } catch (error) {
      console.error("[persistence] upsert-workspace-sync failed:", error);
      event.returnValue = { ok: false, message: String(error) };
    }
  });

  ipcMain.handle("persistence:close-workspace", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false };
    }
    const store = await ensurePersistenceReady();
    store.closeWorkspace({ workspaceId: parsedArgs.data.workspaceId });
    return { ok: true };
  });

  ipcMain.handle("persistence:list-notifications", async (_event, args: unknown) => {
    const parsedArgs = ListNotificationsArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, notifications: [] };
    }
    const store = await ensurePersistenceReady();
    const notifications = store.listNotifications(parsedArgs.data);
    return { ok: true, notifications };
  });

  ipcMain.handle("persistence:create-notification", async (_event, args: unknown) => {
    const parsedArgs = CreateNotificationArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, inserted: false, notification: null };
    }
    const store = await ensurePersistenceReady();
    const result = store.createNotification({
      notification: parsedArgs.data.notification,
    });
    return {
      ok: true,
      inserted: result.inserted,
      notification: result.notification,
    };
  });

  ipcMain.handle("persistence:mark-notification-read", async (_event, args: unknown) => {
    const parsedArgs = MarkNotificationReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, notification: null };
    }
    const store = await ensurePersistenceReady();
    const notification = store.markNotificationRead(parsedArgs.data);
    return { ok: true, notification };
  });

  ipcMain.handle("persistence:mark-all-notifications-read", async (_event, args: unknown) => {
    const parsedArgs = MarkAllNotificationsReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, count: 0 };
    }
    const store = await ensurePersistenceReady();
    const count = store.markAllNotificationsRead(parsedArgs.data);
    return { ok: true, count };
  });

  ipcMain.handle("persistence:list-task-turns", async (_event, args: unknown) => {
    const parsedArgs = ListTaskTurnsArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, turns: [] };
    }
    const store = await ensurePersistenceReady();
    const turns = store.listTurns({
      workspaceId: parsedArgs.data.workspaceId,
      taskId: parsedArgs.data.taskId,
      limit: parsedArgs.data.limit,
    });
    return { ok: true, turns };
  });

  ipcMain.handle("persistence:list-latest-workspace-turns", async (_event, args: unknown) => {
    const parsedArgs = ListLatestWorkspaceTurnsArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, turns: [] };
    }
    const store = await ensurePersistenceReady();
    const turns = store.listLatestTurnsForWorkspace({
      workspaceId: parsedArgs.data.workspaceId,
      limit: parsedArgs.data.limit,
    });
    return { ok: true, turns };
  });

  ipcMain.handle("persistence:list-active-workspace-turns", async (_event, args: unknown) => {
    const parsedArgs = ListActiveWorkspaceTurnsArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, turns: [] };
    }
    const store = await ensurePersistenceReady();
    const turns = store.listActiveTurnsForWorkspace({
      workspaceId: parsedArgs.data.workspaceId,
      limit: parsedArgs.data.limit,
    });
    return { ok: true, turns };
  });
}
