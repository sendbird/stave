// ---------------------------------------------------------------------------
// IPC handlers for the built-in Lens feature
// ---------------------------------------------------------------------------

import { BrowserWindow, ipcMain } from "electron";
import {
  createBrowserSession,
  destroyBrowserSession,
  getBrowserSession,
  getWebContentsForSession,
  pushConsoleEntry,
  setViewBounds,
  setViewVisible,
  updateNavigationState,
} from "../browser/browser-manager";
import {
  captureScreenshot,
  ensureDebuggerAttached,
  detachDebugger,
  getDocumentHTML,
  evaluateExpression,
} from "../browser/browser-cdp";
import { getElementPickerScript } from "../browser/browser-element-picker";
import { normalizeLensUrl } from "../browser/browser-url";
import type {
  BrowserConsoleEntry,
  LensBounds,
} from "../../../src/lib/lens/lens.types";
import { getMainWindow } from "../window";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(): string {
  return new Date().toISOString();
}

function resolveWebContents(
  workspaceId: string,
): Electron.WebContents | undefined {
  return getWebContentsForSession(workspaceId);
}

function sendNavigationEvent(args: {
  workspaceId: string;
  state: ReturnType<typeof updateNavigationState>;
}) {
  if (!args.state) {
    return;
  }

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  renderer.send("lens:navigation-event", {
    workspaceId: args.workspaceId,
    state: args.state,
  });
}

// ---------------------------------------------------------------------------
// Console / Network event listeners for a session
// ---------------------------------------------------------------------------

function attachEventListeners(workspaceId: string, wc: Electron.WebContents) {
  // Navigation events → push to renderer
  const sendNavUpdate = () => {
    const state = updateNavigationState(workspaceId, {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isLoading: wc.isLoading(),
    });
    sendNavigationEvent({ workspaceId, state });
  };

  wc.on("did-navigate", sendNavUpdate);
  wc.on("did-navigate-in-page", sendNavUpdate);
  wc.on("did-start-loading", () => {
    updateNavigationState(workspaceId, { isLoading: true });
    sendNavUpdate();
  });
  wc.on("did-stop-loading", () => {
    updateNavigationState(workspaceId, { isLoading: false });
    sendNavUpdate();
  });
  wc.on(
    "did-fail-load",
    (_event, _errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      pushConsoleEntry(workspaceId, {
        level: "error",
        text: `Navigation failed: ${errorDescription}`,
        timestamp: toIso(),
        source: validatedUrl,
      });
      updateNavigationState(workspaceId, { isLoading: false });
      sendNavUpdate();
    },
  );
  wc.on("page-title-updated", (_e, title) => {
    updateNavigationState(workspaceId, { title });
    sendNavUpdate();
  });

  // Console messages
  wc.on("console-message", (_e, level, message, _line, sourceId) => {
    const levelMap: Record<number, BrowserConsoleEntry["level"]> = {
      0: "debug",
      1: "log",
      2: "warn",
      3: "error",
    };
    pushConsoleEntry(workspaceId, {
      level: levelMap[level] ?? "log",
      text: message,
      timestamp: toIso(),
      source: sourceId,
    });
  });
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerBrowserHandlers() {
  // ---- Create view: create WebContentsView in main process (idempotent) ----
  ipcMain.handle(
    "lens:create-view",
    async (_event, args: { workspaceId: string }) => {
      try {
        // Idempotent: if session already exists, just return ok
        const existing = getBrowserSession(args.workspaceId);
        if (existing) {
          return { ok: true };
        }

        const session = createBrowserSession(args.workspaceId);
        attachEventListeners(args.workspaceId, session.view.webContents);

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Destroy view: tear down session and remove view ----
  ipcMain.handle(
    "lens:destroy-view",
    async (_event, args: { workspaceId: string }) => {
      destroyBrowserSession(args.workspaceId);
      return { ok: true };
    },
  );

  // ---- Set bounds: sync placeholder div bounds → WebContentsView ----
  ipcMain.handle(
    "lens:set-bounds",
    async (event, args: { workspaceId: string; bounds: LensBounds }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        // Store CSS-pixel bounds for zoom-change re-apply
        session.lastCssBounds = args.bounds;

        // Scale CSS pixels → device pixels using the sender window's zoom factor.
        // BrowserWindow.fromWebContents should always resolve here since the
        // sender IS the main BrowserWindow renderer, but we guard defensively.
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          console.warn(
            "[lens:set-bounds] Could not resolve BrowserWindow from IPC sender — " +
              "applying bounds without zoom scaling (HiDPI may be off).",
          );
        }
        const zoomFactor = win?.webContents.getZoomFactor() ?? 1;
        const scaled: LensBounds = {
          x: Math.round(args.bounds.x * zoomFactor),
          y: Math.round(args.bounds.y * zoomFactor),
          width: Math.round(args.bounds.width * zoomFactor),
          height: Math.round(args.bounds.height * zoomFactor),
        };

        setViewBounds(args.workspaceId, scaled);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Set visible: toggle WebContentsView visibility ----
  ipcMain.handle(
    "lens:set-visible",
    async (_event, args: { workspaceId: string; visible: boolean }) => {
      setViewVisible(args.workspaceId, args.visible);
      return { ok: true };
    },
  );

  // ---- Navigate ----
  ipcMain.handle(
    "lens:navigate",
    async (_event, args: { workspaceId: string; url: string }) => {
      const wc = resolveWebContents(args.workspaceId);
      if (!wc) return { ok: false, message: "No browser session" };

      try {
        const url = normalizeLensUrl(args.url);
        await wc.loadURL(url);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Navigation controls ----
  ipcMain.handle(
    "lens:go-back",
    async (_event, args: { workspaceId: string }) => {
      const wc = resolveWebContents(args.workspaceId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.goBack();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:go-forward",
    async (_event, args: { workspaceId: string }) => {
      const wc = resolveWebContents(args.workspaceId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.goForward();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:reload",
    async (_event, args: { workspaceId: string }) => {
      const wc = resolveWebContents(args.workspaceId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.reload();
      return { ok: true };
    },
  );

  // ---- Get current state ----
  ipcMain.handle(
    "lens:get-state",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };
      return { ok: true, state: { ...session.navigationState } };
    },
  );

  // ---- Screenshot ----
  ipcMain.handle(
    "lens:screenshot",
    async (
      _event,
      args: {
        workspaceId: string;
        options?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } };
      },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const dataUrl = await captureScreenshot(
          session.view.webContents.id,
          args.options,
        );
        return { ok: true, dataUrl };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Get DOM HTML ----
  ipcMain.handle(
    "lens:get-dom",
    async (
      _event,
      args: { workspaceId: string; selector?: string },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const html = await getDocumentHTML(
          session.view.webContents.id,
          args.selector,
        );
        return { ok: true, html };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Evaluate JS ----
  ipcMain.handle(
    "lens:evaluate",
    async (
      _event,
      args: { workspaceId: string; expression: string },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const result = await evaluateExpression(
          session.view.webContents.id,
          args.expression,
        );
        return { ok: true, result };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Console log ----
  ipcMain.handle(
    "lens:get-console-log",
    async (_event, args: { workspaceId: string; limit?: number }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      const entries = session.consoleLog.toArray();
      const limit = args.limit ?? 50;
      return { ok: true, entries: entries.slice(-limit) };
    },
  );

  // ---- Network log ----
  ipcMain.handle(
    "lens:get-network-log",
    async (_event, args: { workspaceId: string; limit?: number }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      const entries = session.networkLog.toArray();
      const limit = args.limit ?? 50;
      return { ok: true, entries: entries.slice(-limit) };
    },
  );

  // ---- Element picker ----
  ipcMain.handle(
    "lens:start-element-picker",
    async (
      _event,
      args: { workspaceId: string; options?: { extractDebugSource?: boolean } },
    ) => {
      const wc = resolveWebContents(args.workspaceId);
      if (!wc) return { ok: false, message: "No browser session" };

      try {
        const script = getElementPickerScript({
          extractDebugSource: args.options?.extractDebugSource ?? false,
        });
        const result = await wc.executeJavaScript(script);
        return { ok: true, result };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Attach CDP debugger (for MCP tools) ----
  ipcMain.handle(
    "lens:attach-debugger",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        ensureDebuggerAttached(session.view.webContents.id);
        session.debuggerAttached = true;
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Detach CDP debugger ----
  ipcMain.handle(
    "lens:detach-debugger",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      detachDebugger(session.view.webContents.id);
      session.debuggerAttached = false;
      return { ok: true };
    },
  );
}
