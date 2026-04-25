import { BrowserWindow } from "electron";
import path from "node:path";
import { isDevToolsShortcut } from "./keyboard-shortcuts";
import { openExternalWithFallback } from "./utils/external-url";

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2;
const ZOOM_STEP = 0.1;
const runtimeDir = import.meta.dirname;
let mainWindow: BrowserWindow | null = null;

/** Return the main BrowserWindow instance (used by browser-manager for WebContentsView). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function toggleMainWindowDevTools() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.toggleDevTools();
}

function clampZoomFactor(value: number) {
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, value));
}

function emitZoomChanged(window: BrowserWindow) {
  const factor = window.webContents.getZoomFactor();
  window.webContents.send("window:zoom-changed", {
    factor,
    percent: Math.round(factor * 100),
  });
}

export function createMainWindow() {
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL;
  const allowedOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 12, y: 16 } : undefined,
    title: "Stave",
    webPreferences: {
      preload: path.join(runtimeDir, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = window;
  window.on("closed", () => {
    mainWindow = null;
  });
  window.maximize();

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalWithFallback({ url });
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const isAppUrl = allowedOrigin
      ? new URL(url).origin === allowedOrigin
      : url.startsWith("file://");
    if (isAppUrl || url === window.webContents.getURL()) {
      return;
    }
    event.preventDefault();
    void openExternalWithFallback({ url });
  });

  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(runtimeDir, "../renderer/index.html"));
  }

  window.webContents.on("before-input-event", (event, input) => {
    const hasMod = input.control || input.meta;
    const isCmdW =
      input.type === "keyDown" &&
      hasMod &&
      !input.shift &&
      !input.alt &&
      input.key.toLowerCase() === "w";
    if (isCmdW) {
      event.preventDefault();
      window.webContents.send("shortcut:close-tab-or-task");
      return;
    }
    const isDevToolsToggle = isDevToolsShortcut(input);
    const isZoomIn =
      input.type === "keyDown" &&
      hasMod &&
      !input.alt &&
      (input.key === "+" || input.key === "=" || input.code === "NumpadAdd");
    const isZoomOut =
      input.type === "keyDown" &&
      hasMod &&
      !input.alt &&
      (input.key === "-" || input.code === "NumpadSubtract");
    const isZoomReset =
      input.type === "keyDown" &&
      hasMod &&
      !input.alt &&
      (input.key === "0" || input.code === "Numpad0");
    if (!isDevToolsToggle) {
      if (!isZoomIn && !isZoomOut && !isZoomReset) {
        return;
      }
      event.preventDefault();
      if (isZoomReset) {
        window.webContents.setZoomFactor(1);
        emitZoomChanged(window);
        return;
      }
      const currentZoom = window.webContents.getZoomFactor();
      const nextZoom = isZoomIn
        ? clampZoomFactor(Number((currentZoom + ZOOM_STEP).toFixed(2)))
        : clampZoomFactor(Number((currentZoom - ZOOM_STEP).toFixed(2)));
      window.webContents.setZoomFactor(nextZoom);
      emitZoomChanged(window);
      return;
    }
    event.preventDefault();
    toggleMainWindowDevTools();
  });
}
