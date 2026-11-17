import { NativeNotificationResolvedSchema } from "../../../src/lib/notifications/native-notification-contract";
import { BrowserWindow, Notification, app, ipcMain } from "electron";
import { getMainWindow } from "../window";
import { ensurePersistenceReady } from "../state";
import { getTaskStatus, respondApproval, respondUserInput } from "../stave-mcp-service";
import { tMain } from "../i18n";
import { buildNativeNotificationRequest, createNativeNotificationActionResponder } from "../native-notification-actions";
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
  const respond = createNativeNotificationActionResponder({
    isEnabled: () => process.platform === "darwin" && actionsEnabled,
    isPending: async (request) => {
      const status = await getTaskStatus({ workspaceId: request.workspaceId, taskId: request.taskId });
      if (status.activeTurnId !== request.turnId) return false;
      const pending = request.kind === "approval" ? status.pendingApprovals : status.pendingUserInputs;
      return pending.some(item => item.requestId === request.requestId && item.messageId === request.messageId);
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
    const request = actionsEnabled && process.platform === "darwin" && row ? buildNativeNotificationRequest(row) : null;
    const notification = new Notification({
      title: parsed.data.title,
      body: parsed.data.body,
      silent: true,
      ...(request ? {
        actions: request.buttons.map(button => ({ type: "button" as const,
          text: request.kind === "approval" ? tMain(button.label === "allowOnce" ? "nativeNotification.allowOnce" : "nativeNotification.deny") : button.label })),
        hasReply: request.replyKey != null,
        ...(request.replyKey ? { replyPlaceholder: tMain("nativeNotification.reply") } : {}),
      } : {}),
    });
    if (request) {
      notification.on("action", (_event, index) => {
        const button = request.buttons[index];
        if (button) void respond(request, button.response);
      });
      notification.on("reply", (_event, reply) => {
        if (request.replyKey && typeof reply === "string" && reply.trim() && reply.length <= 100_000) {
          void respond(request, { type: "answer", answers: { [request.replyKey]: reply } });
        }
      });
    }
    notification.on("click", () => {
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
    });
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
