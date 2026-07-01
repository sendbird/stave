// ---------------------------------------------------------------------------
// IPC handlers for the built-in Lens feature
// ---------------------------------------------------------------------------

import { BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  clearBrowserSessionData,
  destroyBrowserSession,
  getBrowserSession,
  getWebContentsForSession,
  setViewBounds,
  setViewVisible,
} from "../browser/browser-manager";
import {
  ensureBrowserSessionWithEvents,
  injectAnnotationOverlay,
  injectBoxInspectOverlay,
  sendAnnotationEvent,
} from "../browser/browser-session-events";
import {
  deriveDownloadFilename,
  enumeratePageAssets,
  getDownloadsDir,
  sendDownloadEvent,
  triggerDownloadByUrl,
} from "../browser/browser-downloads";
import {
  assertCdpAllowedForWebContentsId,
  captureScreenshot,
  ensureDebuggerAttached,
  detachDebugger,
  getDocumentHTML,
  evaluateExpression,
  setElementStyle,
} from "../browser/browser-cdp";
import { getElementPickerScript } from "../browser/browser-element-picker";
import {
  assertNavigationAllowed,
  respondCdpApproval,
  setLensSecurityConfig,
} from "../browser/browser-security";
import { normalizeLensUrl } from "../browser/browser-url";
import type {
  LensAnnotation,
  LensBounds,
  LensCdpApprovalResponse,
  LensDownloadEntry,
  LensSecurityConfig,
  LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";

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

function screenshotFilename(fullPage?: boolean): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `lens-${fullPage ? "full-page" : "viewport"}-${stamp}.png`;
}

async function existingNames(directory: string): Promise<Set<string>> {
  try {
    return new Set(await fs.readdir(directory));
  } catch {
    return new Set();
  }
}

async function readPageAnnotations(
  session: NonNullable<ReturnType<typeof getBrowserSession>>,
): Promise<LensAnnotation[]> {
  try {
    const annotations = await session.view.webContents.executeJavaScript(
      "window.__staveGetAnnotations?.() ?? []",
    );
    return Array.isArray(annotations) ? annotations : [];
  } catch {
    return [];
  }
}

function pngDataUrlToBuffer(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("Screenshot did not return a PNG data URL.");
  }
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerBrowserHandlers() {
  // ---- Security settings: renderer pushes persisted Lens settings to main ----
  ipcMain.handle(
    "lens:set-security-config",
    async (_event, args: LensSecurityConfig) => {
      try {
        const config = setLensSecurityConfig(args);
        return { ok: true, config };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:respond-cdp-approval",
    async (_event, args: LensCdpApprovalResponse) => ({
      ok: respondCdpApproval(args),
    }),
  );

  // ---- Create view: create WebContentsView in main process (idempotent) ----
  ipcMain.handle(
    "lens:create-view",
    async (_event, args: LensSessionProfileArgs) => {
      try {
        const { session } = ensureBrowserSessionWithEvents(args.workspaceId, {
          sessionScope: args.sessionScope,
          projectKey: args.projectKey,
        });
        session.managedByMcp = false;
        return { ok: true, sessionScope: session.sessionProfile.scope };
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

  ipcMain.handle(
    "lens:clear-session-data",
    async (_event, args: LensSessionProfileArgs) => {
      try {
        const sessionProfile = await clearBrowserSessionData(args);
        return {
          ok: true,
          sessionScope: sessionProfile.scope,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
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
        assertNavigationAllowed(url);
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
      return {
        ok: true,
        state: { ...session.navigationState },
        annotationModeActive: session.annotationOverlayActive,
        boxInspectModeActive: session.boxInspectActive,
      };
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
        await session.view.webContents
          .executeJavaScript(
            `new Promise((resolve) => {
              window.__staveSetAnnotationScreenshotCaptureActive?.(false);
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
            })`,
          )
          .catch(() => false);
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
      } finally {
        await session.view.webContents
          .executeJavaScript(
            "window.__staveSetAnnotationScreenshotCaptureActive?.(true) === true",
          )
          .catch(() => false);
      }
    },
  );

  ipcMain.handle(
    "lens:save-screenshot",
    async (
      _event,
      args: {
        workspaceId: string;
        options?: {
          fullPage?: boolean;
          clip?: { x: number; y: number; width: number; height: number };
        };
      },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const dataUrl = await captureScreenshot(
          session.view.webContents.id,
          args.options,
        );
        const buffer = pngDataUrlToBuffer(dataUrl);
        const directory = getDownloadsDir(args.workspaceId);
        await fs.mkdir(directory, { recursive: true });
        const filename = deriveDownloadFilename(
          "lens-screenshot.png",
          screenshotFilename(args.options?.fullPage),
          await existingNames(directory),
        );
        const savePath = path.join(directory, filename);
        await fs.writeFile(savePath, buffer);

        const now = toIso();
        const entry: LensDownloadEntry = {
          id: `${args.workspaceId}:lens-screenshot-${Date.now()}`,
          url: session.navigationState.url,
          filename,
          savePath,
          mimeType: "image/png",
          totalBytes: buffer.length,
          receivedBytes: buffer.length,
          state: "completed",
          startedAt: now,
          completedAt: now,
        };
        session.downloadLog.push(entry);
        sendDownloadEvent(args.workspaceId, entry);

        return { ok: true, path: savePath, entry };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:download-url",
    async (
      _event,
      args: { workspaceId: string; url: string; filename?: string },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const url = normalizeLensUrl(args.url);
        assertNavigationAllowed(url);
        const entry = await triggerDownloadByUrl(
          session.view.webContents.id,
          url,
          args.filename,
        );
        return { ok: true, entry };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:download-page-assets",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const assetUrls = await enumeratePageAssets(session.view.webContents.id);
        const entries: LensDownloadEntry[] = [];
        const errors: Array<{ url: string; message: string }> = [];

        for (const assetUrl of assetUrls) {
          try {
            assertNavigationAllowed(assetUrl);
            entries.push(
              await triggerDownloadByUrl(session.view.webContents.id, assetUrl),
            );
          } catch (error) {
            errors.push({
              url: assetUrl,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return { ok: true, assetUrls, entries, errors };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:list-downloads",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };
      return { ok: true, entries: session.downloadLog.toArray() };
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

  ipcMain.handle(
    "lens:start-annotation-mode",
    async (
      _event,
      args: { workspaceId: string; options?: { extractDebugSource?: boolean } },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        if (session.annotationOverlayActive) {
          return { ok: true };
        }
        const revivedExistingOverlay = await session.view.webContents
          .executeJavaScript(
            "window.__staveSetAnnotationCaptureActive?.(true) === true",
          )
          .catch(() => false);
        if (revivedExistingOverlay && session.annotationNonce) {
          session.annotationOverlayActive = true;
          session.annotationExtractDebugSource =
            args.options?.extractDebugSource ?? false;
          return { ok: true };
        }
        session.annotationOverlayActive = true;
        session.annotationNonce = session.annotationNonce ?? randomUUID();
        session.annotationExtractDebugSource =
          args.options?.extractDebugSource ?? false;
        await injectAnnotationOverlay(args.workspaceId, session.view.webContents);
        return { ok: true };
      } catch (err) {
        session.annotationOverlayActive = false;
        session.annotationNonce = null;
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:stop-annotation-mode",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const annotations = await readPageAnnotations(session);
        if (annotations.length > 0) {
          session.annotations = annotations;
        }
        await session.view.webContents.executeJavaScript(
          "window.__staveSetAnnotationCaptureActive?.(false)",
        );
      } catch {
        // Ignore overlay failures; navigation may already have destroyed page state.
      }
      session.annotationOverlayActive = false;
      session.annotationExtractDebugSource = false;
      return { ok: true };
    },
  );

  // ---- Box-model inspect overlay ----
  ipcMain.handle(
    "lens:start-box-inspect",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        session.boxInspectActive = true;
        await injectBoxInspectOverlay(args.workspaceId, session.view.webContents);
        return { ok: true };
      } catch (err) {
        session.boxInspectActive = false;
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:stop-box-inspect",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        await session.view.webContents.executeJavaScript(
          "window.__staveTeardownInspect?.()",
        );
      } catch {
        // Ignore teardown failures; navigation may already have destroyed page state.
      }
      session.boxInspectActive = false;
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:get-annotations",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const annotations = await readPageAnnotations(session);
        if (Array.isArray(annotations) && annotations.length > 0) {
          session.annotations = annotations;
        }
        return {
          ok: true,
          annotations:
            Array.isArray(annotations) && annotations.length > 0
              ? annotations
              : session.annotations,
        };
      } catch (err) {
        return { ok: true, annotations: session.annotations };
      }
    },
  );

  ipcMain.handle(
    "lens:remove-annotation",
    async (_event, args: { workspaceId: string; annotationId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const removed = await session.view.webContents.executeJavaScript(
          `window.__staveRemoveAnnotation?.(${JSON.stringify(args.annotationId)}) ?? false`,
        );
        if (removed) {
          session.annotations = session.annotations.filter(
            (annotation) => annotation.id !== args.annotationId,
          );
        }
        return { ok: Boolean(removed) };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:clear-annotations",
    async (_event, args: { workspaceId: string }) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        await session.view.webContents.executeJavaScript(
          "window.__staveClearAnnotations?.()",
        );
      } catch {
        // Ignore overlay failures; navigation may already have destroyed page state.
      }
      session.annotations = [];
      sendAnnotationEvent({ workspaceId: args.workspaceId, type: "clear" });
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:set-element-style",
    async (
      _event,
      args: {
        workspaceId: string;
        selector: string;
        patch: Record<string, string>;
      },
    ) => {
      const session = getBrowserSession(args.workspaceId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const edits = await setElementStyle(
          session.view.webContents.id,
          args.selector,
          args.patch,
        );
        return { ok: true, edits };
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
        await assertCdpAllowedForWebContentsId(
          session.view.webContents.id,
          "attach CDP debugger",
        );
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
