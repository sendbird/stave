import { BrowserWindow, Notification, app, ipcMain } from "electron";
import { getMainWindow } from "../window";
import {
  SetNotificationBadgeArgsSchema,
  ShowNativeNotificationArgsSchema,
} from "./schemas";

function updateDockBadge(count: number) {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }
  app.dock.setBadge(count > 0 ? String(count) : "");
}

export function registerNotificationHandlers() {
  ipcMain.handle("notifications:show-native", (event, args: unknown) => {
    const parsed = ShowNativeNotificationArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, suppressed: true };
    }
    if (parsed.data.suppress || !Notification.isSupported()) {
      return { ok: false, suppressed: true };
    }

    const window =
      BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    const notification = new Notification({
      title: parsed.data.title,
      body: parsed.data.body,
      silent: true,
    });
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
