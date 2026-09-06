import { ipcMain } from "electron";
import { WorkspaceDirectionDraftScopeSchema, SaveWorkspaceDirectionDraftSchema } from "../../../src/lib/workspace-resume-brief";
import {
  ClearAcceptedDelegationDraftSchema,
  LoadDelegationDraftSchema,
  SaveDelegationDraftSchema,
} from "../../../src/lib/collaboration/delegation-draft";
import {
  ListResultReviewsArgsSchema,
  SetResultReviewedArgsSchema,
} from "../../../src/lib/reviews/result-review";
import {
  ClearNotificationHistoryArgsSchema,
  CreateNotificationArgsSchema,
  DeleteWorkspaceNotificationsArgsSchema,
  LoadWorkspaceEditorTabBodiesArgsSchema,
  ListActiveWorkspaceTurnsArgsSchema,
  LoadTaskMessagesArgsSchema,
  ListLatestWorkspaceTurnsArgsSchema,
  ListNotificationsArgsSchema,
  ListTaskTurnsArgsSchema,
  MarkAllNotificationsReadArgsSchema,
  MarkNotificationReadArgsSchema,
  PruneNotificationsArgsSchema,
  PersistenceFlushCompleteArgsSchema,
  PersistenceUpsertArgsSchema,
  SaveProjectRegistryArgsSchema,
  TruncateTaskMessagesAfterArgsSchema,
  WorkspaceIdArgsSchema,
} from "./schemas";
import {
  ensurePersistenceReady,
  getPersistenceBootstrapStatus,
} from "../state";
import { resolveRendererPersistenceFlush } from "../persistence-flush-gate";

export function registerPersistenceHandlers() {
  ipcMain.handle("persistence:load-direction-draft", async (_event, args: unknown) => {
    const parsed = WorkspaceDirectionDraftScopeSchema.safeParse(args);
    if (!parsed.success) return { ok: false, draft: null };
    const store = await ensurePersistenceReady();
    return { ok: true, draft: store.directionDrafts.load(parsed.data.workspaceId) };
  });
  ipcMain.handle("persistence:save-direction-draft", async (_event, args: unknown) => {
    const parsed = SaveWorkspaceDirectionDraftSchema.safeParse(args);
    if (!parsed.success) return { ok: false };
    const store = await ensurePersistenceReady();
    store.directionDrafts.save(parsed.data.workspaceId, parsed.data.draft);
    return { ok: true };
  });
  ipcMain.handle(
    "persistence:load-delegation-draft",
    async (_event, args: unknown) => {
      const parsed = LoadDelegationDraftSchema.safeParse(args);
      if (!parsed.success) return { ok: false, draft: null };
      const store = await ensurePersistenceReady();
      return {
        ok: true,
        draft: store.delegationDrafts.load(parsed.data.scope),
      };
    },
  );
  ipcMain.handle(
    "persistence:save-delegation-draft",
    async (_event, args: unknown) => {
      const parsed = SaveDelegationDraftSchema.safeParse(args);
      if (!parsed.success) return { ok: false };
      const store = await ensurePersistenceReady();
      store.delegationDrafts.save(parsed.data.scope, parsed.data.draft);
      return { ok: true };
    },
  );
  ipcMain.handle(
    "persistence:clear-accepted-delegation-draft",
    async (_event, args: unknown) => {
      const parsed = ClearAcceptedDelegationDraftSchema.safeParse(args);
      if (!parsed.success) return { ok: false, cleared: false };
      const store = await ensurePersistenceReady();
      return {
        ok: true,
        cleared: store.delegationDrafts.clearAccepted(
          parsed.data.scope,
          parsed.data.delegationKey,
        ),
      };
    },
  );
  ipcMain.handle("persistence:list-result-reviews", async (_event, args: unknown) => {
    const parsed = ListResultReviewsArgsSchema.safeParse(args ?? {});
    if (!parsed.success) return { ok: false, results: [], total: 0, hasMore: false };
    const store = await ensurePersistenceReady();
    return { ok: true, ...store.resultReviews.list(parsed.data) };
  });
  ipcMain.handle("persistence:set-result-reviewed", async (_event, args: unknown) => {
    const parsed = SetResultReviewedArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, result: null };
    const store = await ensurePersistenceReady();
    const result = store.resultReviews.setReviewed(parsed.data);
    return { ok: result !== null, result };
  });
  ipcMain.handle("persistence:get-bootstrap-status", async () => {
    return getPersistenceBootstrapStatus();
  });

  ipcMain.handle("persistence:list-workspaces", async () => {
    const store = await ensurePersistenceReady();
    const rows = store.listWorkspaceSummaries();
    return { ok: true, rows };
  });

  ipcMain.handle(
    "persistence:load-workspace",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, snapshot: null };
      }
      const store = await ensurePersistenceReady();
      const snapshot = store.loadWorkspaceSnapshot({
        workspaceId: parsedArgs.data.workspaceId,
      });
      return { ok: true, snapshot };
    },
  );

  ipcMain.handle(
    "persistence:load-workspace-shell",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, shell: null };
      }
      const store = await ensurePersistenceReady();
      const shell = store.loadWorkspaceShell({
        workspaceId: parsedArgs.data.workspaceId,
      });
      return { ok: true, shell };
    },
  );

  ipcMain.handle(
    "persistence:load-workspace-shell-for-restore",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, shell: null };
      }
      const store = await ensurePersistenceReady();
      const shell = store.loadWorkspaceShellForRestore({
        workspaceId: parsedArgs.data.workspaceId,
      });
      return { ok: true, shell };
    },
  );

  ipcMain.handle(
    "persistence:load-workspace-shell-lite",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, shellLite: null };
      }
      const store = await ensurePersistenceReady();
      const shellLite = store.loadWorkspaceShellLite({
        workspaceId: parsedArgs.data.workspaceId,
      });
      return { ok: true, shellLite };
    },
  );

  ipcMain.handle(
    "persistence:load-workspace-shell-summary",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, summary: null };
      }
      const store = await ensurePersistenceReady();
      const summary = store.loadWorkspaceShellSummary({
        workspaceId: parsedArgs.data.workspaceId,
      });
      return { ok: true, summary };
    },
  );

  ipcMain.handle(
    "persistence:load-task-messages",
    async (_event, args: unknown) => {
      const parsedArgs = LoadTaskMessagesArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, page: null };
      }
      const store = await ensurePersistenceReady();
      const page = store.loadTaskMessagesPage(parsedArgs.data);
      return { ok: true, page };
    },
  );

  ipcMain.handle(
    "persistence:truncate-task-messages-after",
    async (_event, args: unknown) => {
      const parsedArgs = TruncateTaskMessagesAfterArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, removedCount: 0 };
      }
      const store = await ensurePersistenceReady();
      return store.truncateTaskMessagesAfter(parsedArgs.data);
    },
  );

  ipcMain.handle(
    "persistence:load-workspace-editor-tab-bodies",
    async (_event, args: unknown) => {
      const parsedArgs = LoadWorkspaceEditorTabBodiesArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, bodies: [] };
      }
      const store = await ensurePersistenceReady();
      const bodies = store.loadWorkspaceEditorTabBodies(parsedArgs.data);
      return { ok: true, bodies };
    },
  );

  ipcMain.handle("persistence:load-project-registry", async () => {
    const store = await ensurePersistenceReady();
    const projects = store.loadProjectRegistry();
    return { ok: true, projects, activeProjectPath: store.loadActiveProjectPath() };
  });

  ipcMain.handle(
    "persistence:upsert-workspace",
    async (_event, args: unknown) => {
      const parsedArgs = PersistenceUpsertArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false };
      }
      const store = await ensurePersistenceReady();
      store.upsertWorkspace({
        id: parsedArgs.data.id,
        name: parsedArgs.data.name,
        snapshot: parsedArgs.data.snapshot,
      });
      return { ok: true };
    },
  );

  ipcMain.handle(
    "persistence:save-project-registry",
    async (_event, args: unknown) => {
      const parsedArgs = SaveProjectRegistryArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false };
      }
      const store = await ensurePersistenceReady();
      store.saveProjectRegistry({
        projects: parsedArgs.data.projects as never[],
        activeProjectPath: parsedArgs.data.activeProjectPath,
      });
      return { ok: true };
    },
  );

  // Renderer acknowledgement for the quit-time flush gate. Replaces the old
  // blocking `persistence:upsert-workspace-sync`: the renderer now performs an
  // ordinary async `upsertWorkspace` and reports completion here, so the main
  // thread never runs a full snapshot write inside a synchronous IPC reply.
  ipcMain.handle("persistence:flush-complete", (_event, args: unknown) => {
    const parsedArgs = PersistenceFlushCompleteArgsSchema.safeParse(args);
    if (!parsedArgs.success) return { ok: false };
    return resolveRendererPersistenceFlush(parsedArgs.data);
  });

  ipcMain.handle(
    "persistence:close-workspace",
    async (_event, args: unknown) => {
      const parsedArgs = WorkspaceIdArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false };
      }
      const store = await ensurePersistenceReady();
      store.closeWorkspace({ workspaceId: parsedArgs.data.workspaceId });
      return { ok: true };
    },
  );

  ipcMain.handle(
    "persistence:list-notifications",
    async (_event, args: unknown) => {
      const parsedArgs = ListNotificationsArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, notifications: [] };
      }
      const store = await ensurePersistenceReady();
      const notifications = store.listNotifications(parsedArgs.data);
      return { ok: true, notifications };
    },
  );

  ipcMain.handle(
    "persistence:create-notification",
    async (_event, args: unknown) => {
      const parsedArgs = CreateNotificationArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, inserted: false, notification: null };
      }
      const store = await ensurePersistenceReady();
      const result = store.createNotification({
        notification: {
          ...parsedArgs.data.notification,
          action: parsedArgs.data.notification.action ?? null,
          taskId: parsedArgs.data.notification.taskId ?? null,
          taskTitle: parsedArgs.data.notification.taskTitle ?? null,
          turnId: parsedArgs.data.notification.turnId ?? null,
          workspaceId: parsedArgs.data.notification.workspaceId ?? null,
          workspaceName: parsedArgs.data.notification.workspaceName ?? null,
          projectPath: parsedArgs.data.notification.projectPath ?? null,
          projectName: parsedArgs.data.notification.projectName ?? null,
          providerId: parsedArgs.data.notification.providerId ?? null,
          payload: parsedArgs.data.notification.payload ?? {},
        },
      });
      return {
        ok: true,
        inserted: result.inserted,
        notification: result.notification,
      };
    },
  );

  ipcMain.handle(
    "persistence:mark-notification-read",
    async (_event, args: unknown) => {
      const parsedArgs = MarkNotificationReadArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, notification: null };
      }
      const store = await ensurePersistenceReady();
      const notification = store.markNotificationRead(parsedArgs.data);
      return { ok: true, notification };
    },
  );

  ipcMain.handle(
    "persistence:mark-all-notifications-read",
    async (_event, args: unknown) => {
      const parsedArgs = MarkAllNotificationsReadArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, count: 0 };
      }
      const store = await ensurePersistenceReady();
      const count = store.markAllNotificationsRead(parsedArgs.data);
      return { ok: true, count };
    },
  );

  ipcMain.handle(
    "persistence:prune-notifications",
    async (_event, args: unknown) => {
      const parsedArgs = PruneNotificationsArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, count: 0 };
      }
      const store = await ensurePersistenceReady();
      const count = store.pruneNotifications(parsedArgs.data);
      return { ok: true, count };
    },
  );

  ipcMain.handle(
    "persistence:delete-notifications-for-workspaces",
    async (_event, args: unknown) => {
      const parsedArgs = DeleteWorkspaceNotificationsArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, count: 0 };
      }
      const store = await ensurePersistenceReady();
      const count = store.deleteNotificationsForWorkspaces(parsedArgs.data);
      return { ok: true, count };
    },
  );

  ipcMain.handle("persistence:delete-orphaned-notifications", async () => {
    // No arguments on purpose: the store decides which workspaces are gone.
    const store = await ensurePersistenceReady();
    const { count, workspaceIds } = store.deleteOrphanedNotifications();
    return { ok: true, count, workspaceIds };
  });

  ipcMain.handle(
    "persistence:clear-notification-history",
    async (_event, args: unknown) => {
      const parsedArgs = ClearNotificationHistoryArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return { ok: false, count: 0 };
      }
      const store = await ensurePersistenceReady();
      const count = store.clearNotificationHistory();
      return { ok: true, count };
    },
  );

  ipcMain.handle(
    "persistence:list-task-turns",
    async (_event, args: unknown) => {
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
    },
  );

  ipcMain.handle(
    "persistence:list-latest-workspace-turns",
    async (_event, args: unknown) => {
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
    },
  );

  ipcMain.handle(
    "persistence:list-active-workspace-turns",
    async (_event, args: unknown) => {
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
    },
  );
}
