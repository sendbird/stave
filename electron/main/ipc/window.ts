import { app, BrowserWindow, ipcMain } from "electron";
import {
  cancelQuitPrompt,
  confirmQuitPrompt,
  isQuitPromptOpen,
} from "../quit-state";

export function registerWindowHandlers() {
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return { isMaximized: false };
    }
    if (window.isMaximized()) {
      window.unmaximize();
      return { isMaximized: false };
    }
    window.maximize();
    return { isMaximized: true };
  });

  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("window:confirm-app-quit", () => {
    if (!isQuitPromptOpen()) {
      return { ok: false };
    }
    confirmQuitPrompt();
    queueMicrotask(() => {
      app.quit();
    });
    return { ok: true };
  });

  ipcMain.handle("window:cancel-app-quit", () => {
    cancelQuitPrompt();
    return { ok: true };
  });

  ipcMain.handle("window:is-maximized", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return { isMaximized: window?.isMaximized() ?? false };
  });

  ipcMain.handle("window:get-gpu-status", () => ({
    hardwareAccelerationEnabled: app.isHardwareAccelerationEnabled(),
    featureStatus: app.getGPUFeatureStatus(),
  }));
}
