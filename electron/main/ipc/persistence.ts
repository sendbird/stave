import { ipcMain } from "electron";
import type { PersistenceWorkspaceSnapshot } from "../../persistence/types";
import {
  ListLatestWorkspaceTurnsArgsSchema,
  ListTaskTurnsArgsSchema,
  ListTurnEventsArgsSchema,
  PersistenceUpsertArgsSchema,
  WorkspaceIdArgsSchema,
} from "./schemas";
import { ensurePersistenceReady, ensurePersistenceReadySync } from "../state";

export function registerPersistenceHandlers() {
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

  ipcMain.handle("persistence:delete-workspace", async (_event, args: unknown) => {
    const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false };
    }
    const store = await ensurePersistenceReady();
    store.deleteWorkspace({ workspaceId: parsedArgs.data.workspaceId });
    return { ok: true };
  });

  ipcMain.handle("persistence:list-turn-events", async (_event, args: unknown) => {
    const parsedArgs = ListTurnEventsArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, events: [] };
    }
    const store = await ensurePersistenceReady();
    const events = store.listTurnEvents({
      turnId: parsedArgs.data.turnId,
      afterSequence: parsedArgs.data.afterSequence,
      limit: parsedArgs.data.limit,
    });
    return { ok: true, events };
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
}
