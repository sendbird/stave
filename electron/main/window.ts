import { BrowserWindow } from "electron";
import {
  hideAllBrowserSessions,
  restoreSuspendedBrowserSessions,
  suspendVisibleBrowserSessions,
} from "./browser/browser-manager";
import { isDevToolsShortcut } from "./keyboard-shortcuts";
import {
  recordRendererProcessGone,
  recordRendererResponsive,
  recordRendererUnresponsive,
} from "./runtime-health-metrics";
import { openExternalWithFallback } from "./utils/external-url";
import {
  resolvePreloadScriptPath,
  resolveRendererEntryPath,
} from "./window-paths";

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
      preload: resolvePreloadScriptPath(runtimeDir),
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

  // A renderer reload does not tear down Lens `WebContentsView`s: they stay
  // attached with their last bounds and `visible: true`, painting over the new
  // UI until their panel remounts. Hide them here so a reload can never leave a
  // stuck Lens overlay; sessions survive and each panel restores its own view.
  window.webContents.on("did-start-loading", () => {
    hideAllBrowserSessions();
  });
  window.on("unresponsive", () => {
    recordRendererUnresponsive();
    suspendVisibleBrowserSessions();
  });
  window.on("responsive", () => {
    recordRendererResponsive();
    restoreSuspendedBrowserSessions();
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    recordRendererProcessGone(details.reason);
    hideAllBrowserSessions();
  });

  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(resolveRendererEntryPath(runtimeDir));
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
