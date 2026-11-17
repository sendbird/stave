import { publishesStoredInteractionNotifications } from "../../../src/lib/notifications/interaction-policy";
import { requestRendererPersistenceFlush } from "../persistence-flush-gate";
import { NativeNotificationResolvedSchema } from "../../../src/lib/notifications/native-notification-contract";
import { BrowserWindow, Notification, app, ipcMain } from "electron";
import { getMainWindow } from "../window";
import { ensurePersistenceReady } from "../state";
import { getTaskStatus, respondApproval, respondUserInput } from "../stave-mcp-service";
import { tMain } from "../i18n";
import { buildNativeNotificationRequest, buildNativeReplyResponse, createNativeNotificationActionResponder } from "../native-notification-actions";
import {
  SetNotificationBadgeArgsSchema,
  ShowNativeNotificationArgsSchema,
  SetNotificationActionsEnabledArgsSchema,
} from "./schemas";

function updateDockBadge(count: number) {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }
  app.dock.setBadge(count > 0 ? String(count) : "");
}

export function registerNotificationHandlers() {
  let actionsEnabled = false;
  const activeNotifications = new Set<Notification>();
  ipcMain.handle("notifications:set-actions-enabled", (_event, args: unknown) => {
    const parsed = SetNotificationActionsEnabledArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false };
    actionsEnabled = process.platform === "darwin" && parsed.data.enabled;
    return { ok: true };
  });
  const showCouldNotAnswer = () => new Notification({ title: tMain("nativeNotification.couldNotAnswer"), silent: true }).show();
  const respond = createNativeNotificationActionResponder({
    isEnabled: () => process.platform === "darwin" && actionsEnabled,
    isPending: async (request) => {
      // Without a flushed renderer snapshot the host may read a stale request.
      if (await requestRendererPersistenceFlush() !== "flushed") return "unavailable";
      const store = await ensurePersistenceReady();
      const task = store.loadWorkspaceShell({ workspaceId: request.workspaceId })?.tasks.find(task => task.id === request.taskId);
      // A task that is gone or now controlled elsewhere is not "answered"; send the user to Stave.
      if (!task || !publishesStoredInteractionNotifications(task)) return "unavailable";
      const status = await getTaskStatus({ workspaceId: request.workspaceId, taskId: request.taskId, refresh: true });
      if (status.activeTurnId !== request.turnId) return "answered";
      const pending = request.kind === "approval" ? status.pendingApprovals : status.pendingUserInputs;
      return pending.some(item => item.requestId === request.requestId && item.messageId === request.messageId) ? "pending" : "answered";
    },
    respondApproval, respondUserInput,
    resolved: (request, response) => {
      const window = getMainWindow();
      const payload = NativeNotificationResolvedSchema.parse({
        workspaceId: request.workspaceId, taskId: request.taskId, turnId: request.turnId,
        requestId: request.requestId, messageId: request.messageId, response,
      });
      if (window && !window.isDestroyed()) window.webContents.send("notifications:native-resolved", payload);
    },
    alreadyAnswered: () => new Notification({ title: tMain("nativeNotification.alreadyAnswered"), silent: true }).show(),
    couldNotAnswer: showCouldNotAnswer,
  });
  ipcMain.handle("notifications:show-native", async (event, args: unknown) => {
    const parsed = ShowNativeNotificationArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, suppressed: true };
    }
    if (parsed.data.suppress || !Notification.isSupported()) {
      return { ok: false, suppressed: true };
    }

    const window =
      BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    const store = await ensurePersistenceReady();
    const row = store.listNotifications().find(item => item.id === parsed.data.notificationId);
    const task = row?.workspaceId && row.taskId
      ? store.loadWorkspaceShell({ workspaceId: row.workspaceId })?.tasks.find(task => task.id === row.taskId)
      : null;
    const request = actionsEnabled && process.platform === "darwin" && row && task && publishesStoredInteractionNotifications(task)
      ? buildNativeNotificationRequest(row) : null;
    const approvalLabel = (label: string) => tMain(
      label === "allowOnce" ? "nativeNotification.allowOnce"
        : label === "openToReview" ? "nativeNotification.openToReview"
          : "nativeNotification.deny",
    );
    const notification = new Notification({
      title: parsed.data.title,
      body: parsed.data.body,
      silent: true,
      ...(request ? {
        actions: request.buttons.map(button => ({ type: "button" as const,
          text: request.kind === "approval" ? approvalLabel(button.label) : button.label })),
        hasReply: request.reply != null,
        ...(request.reply ? { replyPlaceholder: tMain("nativeNotification.reply") } : {}),
      } : {}),
    });
    const openTask = () => {
      if (window && !window.isDestroyed()) {
        if (window.isMinimized()) {
          window.restore();
        }
        window.show();
        window.focus();
        window.webContents.send("notifications:native-click", {
          notificationId: parsed.data.notificationId,
        });
      }
    };
    if (request) {
      notification.on("action", (_event, index) => {
        const button = request.buttons[index];
        if (!button) return;
        if (button.response.type === "open") openTask();
        else void respond(request, button.response);
      });
      notification.on("reply", (_event, reply) => {
        const response = buildNativeReplyResponse(request, reply);
        // A reply the question would not accept is never sent; answer in Stave.
        if (response) void respond(request, response);
        else showCouldNotAnswer();
      });
    }
    notification.on("click", openTask);
    activeNotifications.add(notification);
    notification.on("close", () => activeNotifications.delete(notification));
    notification.show();
    return { ok: true, suppressed: false };
  });

  ipcMain.handle("notifications:set-badge", (_event, args: unknown) => {
    const parsed = SetNotificationBadgeArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    updateDockBadge(parsed.data.count);
    return { ok: true };
  });
}
