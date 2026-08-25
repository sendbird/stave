// ---------------------------------------------------------------------------
// IPC handlers for the built-in Lens feature
// ---------------------------------------------------------------------------

import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  clearBrowserSessionLog,
  clearBrowserSessionData,
  destroyBrowserSession,
  getBrowserSession,
  getWebContentsForSession,
  listBrowserSessions,
  pushConsoleEntry,
  pushNetworkEntry,
  setSessionPresented,
} from "../browser/browser-manager";
import {
  bindBrowserSessionGuestWithEvents,
  injectAnnotationOverlay,
  injectBoxInspectOverlay,
  sendAnnotationEvent,
} from "../browser/browser-session-events";
import {
  ensureBrowserSessionGuest,
  notifyLensGuestFailed,
  resolveLensGuestFocus,
} from "../browser/browser-guest-broker";
import {
  assertLensDocumentIdentity,
  LENS_ANNOTATION_BEACON_MARKER,
  normalizeElementPickerResultForSession,
  normalizeStoredAnnotationsForSession,
  readNormalizedPageAnnotations,
} from "../browser/browser-annotation-ingestion";
import { executeInLensAnnotationWorld } from "../browser/browser-annotation-world";
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
  getDocumentHTML,
  evaluateExpression,
  setElementStyle,
} from "../browser/browser-cdp";
import {
  getLensCdpDiagnosticsState,
  getLensConsoleEntryDetail,
  getLensConsoleObjectProperties,
  getLensNetworkBody,
  getLensNetworkEntryDetail,
  startLensCdpDiagnostics,
  stopLensCdpDiagnostics,
} from "../browser/browser-cdp-diagnostics";
import { getElementPickerScript } from "../browser/browser-element-picker";
import {
  assertNavigationAllowed,
  respondCdpApproval,
  setLensSecurityConfig,
} from "../browser/browser-security";
import { normalizeLensUrl } from "../browser/browser-url";
import {
  deleteLensCredential,
  listLensCredentials,
  upsertLensCredential,
} from "../browser/lens-credential-service";
import {
  LensAnnotationRemoveArgsSchema,
  LensAnnotationStartArgsSchema,
  LensAnnotationStyleArgsSchema,
  LensCredentialDeleteArgsSchema,
  LensCredentialUpsertArgsSchema,
  LensConsoleEntryDetailArgsSchema,
  LensConsoleObjectPropertiesArgsSchema,
  LensDiagnosticsCaptureArgsSchema,
  LensLogClearArgsSchema,
  LensLogQueryArgsSchema,
  LensNetworkBodyArgsSchema,
  LensNetworkEntryDetailArgsSchema,
  LensScreenshotArgsSchema,
  LensSessionTargetArgsSchema,
} from "./schemas";
import type {
  LensCdpApprovalResponse,
  LensDownloadEntry,
  LensGuestFocusResultPayload,
  LensSecurityConfig,
  LensSessionDescriptor,
  LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";
import { getMainWindow } from "../window";
import { isTrustedLensRenderer } from "./lens-ipc-authorization";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(): string {
  return new Date().toISOString();
}

function resolveWebContents(
  workspaceId: string,
  lensSessionId?: string,
): Electron.WebContents | undefined {
  return getWebContentsForSession(workspaceId, lensSessionId);
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
  // ---- Saved accounts: secrets stay in the Electron main-process vault ----
  ipcMain.handle("lens:list-credentials", async () => {
    try {
      return { ok: true, credentials: await listLensCredentials() };
    } catch (err) {
      return {
        ok: false,
        credentials: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("lens:upsert-credential", async (_event, args: unknown) => {
    const parsed = LensCredentialUpsertArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid Lens account details." };
    }
    try {
      return {
        ok: true,
        credential: await upsertLensCredential(parsed.data),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("lens:delete-credential", async (_event, args: unknown) => {
    const parsed = LensCredentialDeleteArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid saved Lens account id." };
    }
    try {
      const deleted = await deleteLensCredential(parsed.data.id);
      return {
        ok: deleted,
        message: deleted
          ? undefined
          : "The saved Lens account no longer exists.",
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

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

  // ---- Session lifecycle (multi-session lens tabs) ----
  //
  // Still one call for the caller, but no longer one hop. A `<webview>` guest
  // can only be created by the renderer, so main resolves the session's
  // identity and partition, asks the window for a page, and resolves this
  // invoke once that page has come back through `lens:bind-guest`. Panels and
  // agent tools go through the same `ensureBrowserSessionGuest`, so "the
  // session is open" means the same thing to both.
  ipcMain.handle(
    "lens:open-session",
    async (
      event,
      args: LensSessionProfileArgs & {
        lensSessionId: string;
        url?: string;
      },
    ) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      try {
        const { session, created } = await ensureBrowserSessionGuest(
          args.workspaceId,
          {
            sessionScope: args.sessionScope,
            projectKey: args.projectKey,
            lensSessionId: args.lensSessionId,
            // An explicit address is where this open wants to end up, so the
            // recovery restore would only be a load for the one below to abort.
            restorePreviousUrl: !args.url?.trim(),
          },
        );
        // Adopting an agent-opened session into a panel is how a hidden page
        // becomes a visible tab; it stops being MCP-owned at that point.
        session.managedByMcp = false;

        if (args.url?.trim()) {
          const url = normalizeLensUrl(args.url);
          assertNavigationAllowed(url);
          await session.webContents.loadURL(url);
        }

        return {
          ok: true,
          created,
          session: {
            workspaceId: session.workspaceId,
            lensSessionId: session.lensSessionId,
            url: session.navigationState.url,
            title: session.navigationState.title,
            isLoading: session.navigationState.isLoading,
            managedByMcp: session.managedByMcp,
            sessionScope: session.sessionProfile.scope,
          } satisfies LensSessionDescriptor,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // ---- Bind a renderer-created guest to its session ----
  ipcMain.handle(
    "lens:bind-guest",
    async (
      event,
      args: LensSessionProfileArgs & {
        lensSessionId: string;
        guestWebContentsId: number;
        managedByMcp?: boolean;
      },
    ) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      if (!Number.isInteger(args?.guestWebContentsId)) {
        return { ok: false, message: "Invalid guest WebContents id" };
      }
      try {
        const result = bindBrowserSessionGuestWithEvents({
          workspaceId: args.workspaceId,
          lensSessionId: args.lensSessionId,
          guestWebContentsId: args.guestWebContentsId,
          sessionScope: args.sessionScope,
          projectKey: args.projectKey,
          managedByMcp: args.managedByMcp,
        });

        if (!result.ok) {
          // A main-initiated open is blocked on this bind; it has to hear the
          // refusal rather than wait out its timeout.
          notifyLensGuestFailed(
            args.workspaceId,
            args.lensSessionId,
            result.message,
          );
          return { ok: false, message: result.message };
        }

        return { ok: true, created: result.created };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notifyLensGuestFailed(args.workspaceId, args.lensSessionId, message);
        return { ok: false, message };
      }
    },
  );

  // ---- Report which sessions a renderer panel is showing ----
  //
  // A report, not a command: the renderer has already shown or hidden the
  // element. Main keeps the answer so an agent call with no explicit session id
  // can target the tab the user is actually looking at.
  ipcMain.handle(
    "lens:set-presented",
    async (
      event,
      args: {
        workspaceId: string;
        lensSessionId?: string;
        presented: boolean;
      },
    ) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      setSessionPresented(
        args.workspaceId,
        args.presented === true,
        args.lensSessionId,
      );
      return { ok: true };
    },
  );

  // ---- Renderer could not mount a guest at all ----
  //
  // Distinct from a refused bind: nothing was ever nominated, so there is no id
  // to judge. Without this channel a mount failure would only surface as the
  // broker's 15s timeout, which is a long time for an agent tool call to hang
  // on something that already failed.
  ipcMain.on(
    "lens:guest-mount-failed",
    (
      event,
      payload: {
        workspaceId: string;
        lensSessionId: string;
        message?: string;
      },
    ) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) {
        return;
      }
      if (
        typeof payload?.workspaceId !== "string" ||
        typeof payload?.lensSessionId !== "string"
      ) {
        return;
      }
      notifyLensGuestFailed(
        payload.workspaceId,
        payload.lensSessionId,
        payload.message?.trim() || "The Stave window could not open a Lens page",
      );
    },
  );

  // ---- Renderer's answer to a focus borrow ----
  ipcMain.on(
    "lens:guest-focus-result",
    (event, payload: LensGuestFocusResultPayload) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) {
        return;
      }
      if (typeof payload?.requestId !== "string") {
        return;
      }
      resolveLensGuestFocus({
        requestId: payload.requestId,
        ok: payload.ok === true,
        message: payload.message,
      });
    },
  );

  ipcMain.handle(
    "lens:close-session",
    async (_event, args: { workspaceId: string; lensSessionId: string }) => {
      const existed = Boolean(
        getBrowserSession(args.workspaceId, args.lensSessionId),
      );
      await destroyBrowserSession(args.workspaceId, args.lensSessionId);
      return { ok: true, closed: existed };
    },
  );

  ipcMain.handle(
    "lens:list-sessions",
    async (_event, args: { workspaceId?: string }) => ({
      ok: true,
      sessions: listBrowserSessions(args?.workspaceId),
    }),
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

  // ---- Navigate ----
  ipcMain.handle(
    "lens:navigate",
    async (
      _event,
      args: { workspaceId: string; lensSessionId?: string; url: string },
    ) => {
      const wc = resolveWebContents(args.workspaceId, args.lensSessionId);
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const wc = resolveWebContents(args.workspaceId, args.lensSessionId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.goBack();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:go-forward",
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const wc = resolveWebContents(args.workspaceId, args.lensSessionId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.goForward();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:reload",
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const wc = resolveWebContents(args.workspaceId, args.lensSessionId);
      if (!wc) return { ok: false, message: "No browser session" };
      wc.reload();
      return { ok: true };
    },
  );

  // ---- Get current state ----
  ipcMain.handle(
    "lens:get-state",
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
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
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensScreenshotArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens screenshot request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        assertLensDocumentIdentity(session, args.options?.documentId);
        const captureDocumentId = session.documentId;
        await executeInLensAnnotationWorld(
          session.webContents,
            `new Promise((resolve) => {
              window.__staveSetAnnotationScreenshotCaptureActive?.(false);
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
            })`,
          )
          .catch(() => false);
        const { documentId: _documentId, ...captureOptions } =
          args.options ?? {};
        const dataUrl = await captureScreenshot(
          session.webContents.id,
          captureOptions,
        );
        assertLensDocumentIdentity(session, captureDocumentId);
        return { ok: true, dataUrl, documentId: captureDocumentId };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      } finally {
        await executeInLensAnnotationWorld(
          session.webContents,
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
        lensSessionId?: string;
        options?: {
          fullPage?: boolean;
          clip?: { x: number; y: number; width: number; height: number };
        };
      },
    ) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const dataUrl = await captureScreenshot(
          session.webContents.id,
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
        sendDownloadEvent(args.workspaceId, entry, session.lensSessionId);

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
      args: {
        workspaceId: string;
        lensSessionId?: string;
        url: string;
        filename?: string;
      },
    ) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const url = normalizeLensUrl(args.url);
        assertNavigationAllowed(url);
        const entry = await triggerDownloadByUrl(
          session.webContents.id,
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const assetUrls = await enumeratePageAssets(
          session.webContents.id,
        );
        const entries: LensDownloadEntry[] = [];
        const errors: Array<{ url: string; message: string }> = [];

        for (const assetUrl of assetUrls) {
          try {
            assertNavigationAllowed(assetUrl);
            entries.push(
              await triggerDownloadByUrl(session.webContents.id, assetUrl),
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };
      return { ok: true, entries: session.downloadLog.toArray() };
    },
  );

  // ---- Get DOM HTML ----
  ipcMain.handle(
    "lens:get-dom",
    async (
      _event,
      args: { workspaceId: string; lensSessionId?: string; selector?: string },
    ) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const html = await getDocumentHTML(
          session.webContents.id,
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
      args: {
        workspaceId: string;
        lensSessionId?: string;
        expression: string;
      },
    ) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const result = await evaluateExpression(
          session.webContents.id,
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
  ipcMain.handle("lens:get-console-log", async (_event, args: unknown) => {
    const parsed = LensLogQueryArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, entries: [], message: "Invalid log request" };
    }
    const session = getBrowserSession(
      parsed.data.workspaceId,
      parsed.data.lensSessionId,
    );
    if (!session) return { ok: false, message: "No browser session" };

    const entries = session.consoleLog.toArray();
    const limit = parsed.data.limit ?? 50;
    return { ok: true, entries: entries.slice(-limit) };
  });

  ipcMain.handle("lens:clear-console-log", async (_event, args: unknown) => {
    const parsed = LensLogClearArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid log request" };
    }
    const cleared = clearBrowserSessionLog(
      parsed.data.workspaceId,
      "console",
      parsed.data.lensSessionId,
    );
    return {
      ok: cleared,
      message: cleared ? undefined : "No browser session",
    };
  });

  ipcMain.handle(
    "lens:get-console-entry-detail",
    async (_event, args: unknown) => {
      const parsed = LensConsoleEntryDetailArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid console detail request" };
      }
      const session = getBrowserSession(
        parsed.data.workspaceId,
        parsed.data.lensSessionId,
      );
      if (!session) return { ok: false, message: "No browser session" };
      const detail = getLensConsoleEntryDetail(
        session.webContentsId,
        parsed.data.entryId,
      );
      return detail
        ? { ok: true, detail }
        : { ok: false, message: "Console detail is no longer available" };
    },
  );

  ipcMain.handle(
    "lens:get-console-object-properties",
    async (_event, args: unknown) => {
      const parsed = LensConsoleObjectPropertiesArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid object inspector request" };
      }
      const session = getBrowserSession(
        parsed.data.workspaceId,
        parsed.data.lensSessionId,
      );
      if (!session) return { ok: false, message: "No browser session" };
      try {
        const properties = await getLensConsoleObjectProperties({
          webContentsId: session.webContentsId,
          entryId: parsed.data.entryId,
          objectHandle: parsed.data.objectHandle,
          limit: parsed.data.limit ?? 100,
        });
        return properties
          ? { ok: true, properties }
          : { ok: false, message: "Object preview is no longer available" };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // ---- Network log ----
  ipcMain.handle("lens:get-network-log", async (_event, args: unknown) => {
    const parsed = LensLogQueryArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, entries: [], message: "Invalid log request" };
    }
    const session = getBrowserSession(
      parsed.data.workspaceId,
      parsed.data.lensSessionId,
    );
    if (!session) return { ok: false, message: "No browser session" };

    const entries = session.networkLog.toArray();
    const limit = parsed.data.limit ?? 50;
    return { ok: true, entries: entries.slice(-limit) };
  });

  ipcMain.handle("lens:clear-network-log", async (_event, args: unknown) => {
    const parsed = LensLogClearArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid log request" };
    }
    const cleared = clearBrowserSessionLog(
      parsed.data.workspaceId,
      "network",
      parsed.data.lensSessionId,
    );
    return {
      ok: cleared,
      message: cleared ? undefined : "No browser session",
    };
  });

  ipcMain.handle(
    "lens:get-network-entry-detail",
    async (_event, args: unknown) => {
      const parsed = LensNetworkEntryDetailArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid network detail request" };
      }
      const session = getBrowserSession(
        parsed.data.workspaceId,
        parsed.data.lensSessionId,
      );
      if (!session) return { ok: false, message: "No browser session" };
      const detail = getLensNetworkEntryDetail(
        session.webContentsId,
        parsed.data.entryId,
      );
      return detail
        ? { ok: true, detail }
        : { ok: false, message: "Network detail is no longer available" };
    },
  );

  ipcMain.handle("lens:get-network-body", async (_event, args: unknown) => {
    const parsed = LensNetworkBodyArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid network body request" };
    }
    const session = getBrowserSession(
      parsed.data.workspaceId,
      parsed.data.lensSessionId,
    );
    if (!session) return { ok: false, message: "No browser session" };
    const body = getLensNetworkBody(
      session.webContentsId,
      parsed.data.entryId,
      parsed.data.kind,
    );
    return body
      ? { ok: true, body }
      : { ok: false, message: "Network body is no longer available" };
  });

  ipcMain.handle(
    "lens:get-diagnostics-capture-state",
    async (_event, args: unknown) => {
      const parsed = LensLogClearArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid diagnostics request" };
      }
      const session = getBrowserSession(
        parsed.data.workspaceId,
        parsed.data.lensSessionId,
      );
      if (!session) return { ok: false, message: "No browser session" };
      return {
        ok: true,
        state: getLensCdpDiagnosticsState(session.webContentsId),
      };
    },
  );

  ipcMain.handle(
    "lens:set-diagnostics-capture",
    async (_event, args: unknown) => {
      const parsed = LensDiagnosticsCaptureArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid diagnostics request" };
      }
      const session = getBrowserSession(
        parsed.data.workspaceId,
        parsed.data.lensSessionId,
      );
      if (!session) return { ok: false, message: "No browser session" };
      const isCurrentSession = () => {
        try {
          return (
            !session.closing &&
            !session.webContents.isDestroyed() &&
            getBrowserSession(session.workspaceId, session.lensSessionId) ===
              session
          );
        } catch {
          return false;
        }
      };
      if (!parsed.data.enabled) {
        return {
          ok: true,
          state: stopLensCdpDiagnostics(session.webContentsId, true, true),
        };
      }

      try {
        await assertCdpAllowedForWebContentsId(
          session.webContentsId,
          "capture full Lens diagnostics",
        );
        if (!isCurrentSession()) {
          throw new Error(
            "Lens browser session closed while CDP access was pending.",
          );
        }
        const state = await startLensCdpDiagnostics({
          webContentsId: session.webContentsId,
          workspaceId: session.workspaceId,
          lensSessionId: session.lensSessionId,
          url: session.webContents.getURL(),
          acceptConsoleEntry: () =>
            isCurrentSession()
              ? session.consoleRateLimiter.accept()
              : { accepted: false, droppedCount: 0 },
          acceptNetworkRequest: () =>
            isCurrentSession()
              ? session.networkRateLimiter.accept()
              : { accepted: false, droppedCount: 0 },
          onConsoleEntry: (entry) => {
            if (isCurrentSession()) {
              pushConsoleEntry(
                session.workspaceId,
                entry,
                session.lensSessionId,
              );
            }
          },
          onNetworkEntry: (entry) => {
            if (isCurrentSession()) {
              pushNetworkEntry(
                session.workspaceId,
                entry,
                session.lensSessionId,
              );
            }
          },
          shouldIgnoreConsoleText: (text) =>
            text.startsWith(LENS_ANNOTATION_BEACON_MARKER),
        });
        return {
          ok: state.enabled,
          state,
          message: state.message,
        };
      } catch (error) {
        return {
          ok: false,
          state: { enabled: false },
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // ---- Element picker ----
  ipcMain.handle(
    "lens:start-element-picker",
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensAnnotationStartArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens element picker request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const documentId = session.documentId;
        const script = getElementPickerScript({
          documentId,
          extractDebugSource: args.options?.extractDebugSource ?? false,
        });
        const rawResult = await executeInLensAnnotationWorld(
          session.webContents,
          script,
        );
        if (rawResult == null) {
          return { ok: true };
        }
        assertLensDocumentIdentity(session, documentId);
        const result = normalizeElementPickerResultForSession(
          session,
          rawResult,
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

  ipcMain.handle(
    "lens:start-annotation-mode",
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensAnnotationStartArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens annotation request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        if (session.annotationOverlayActive) {
          return { ok: true };
        }
        const revivedExistingOverlay = await executeInLensAnnotationWorld(
          session.webContents,
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
        await injectAnnotationOverlay(
          args.workspaceId,
          session.webContents,
          args.lensSessionId,
        );
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
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensSessionTargetArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens annotation request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        session.annotations = await readNormalizedPageAnnotations(session);
        await executeInLensAnnotationWorld(
          session.webContents,
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        session.boxInspectActive = true;
        await injectBoxInspectOverlay(
          args.workspaceId,
          session.webContents,
          args.lensSessionId,
        );
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        await session.webContents.executeJavaScript(
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
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensSessionTargetArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens annotation request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        const annotations = await readNormalizedPageAnnotations(session);
        session.annotations = annotations;
        return {
          ok: true,
          annotations,
        };
      } catch (err) {
        return {
          ok: true,
          annotations: session.annotations.filter(
            (annotation) =>
              annotation.review.page.documentId === session.documentId,
          ),
        };
      }
    },
  );

  ipcMain.handle(
    "lens:remove-annotation",
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensAnnotationRemoveArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens annotation request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        assertLensDocumentIdentity(session, args.documentId);
        const removed = await executeInLensAnnotationWorld(
          session.webContents,
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
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensSessionTargetArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens annotation request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        await executeInLensAnnotationWorld(
          session.webContents,
          "window.__staveClearAnnotations?.()",
        );
      } catch {
        // Ignore overlay failures; navigation may already have destroyed page state.
      }
      session.annotations = [];
      sendAnnotationEvent({
        workspaceId: args.workspaceId,
        lensSessionId: session.lensSessionId,
        documentId: session.documentId,
        type: "clear",
      });
      return { ok: true };
    },
  );

  ipcMain.handle(
    "lens:set-element-style",
    async (event, input: unknown) => {
      if (
        !isTrustedLensRenderer(event, getMainWindow()?.webContents)
      ) {
        return { ok: false, message: "Unauthorized Lens renderer" };
      }
      const parsed = LensAnnotationStyleArgsSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Lens style request" };
      }
      const args = parsed.data;
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        assertLensDocumentIdentity(session, args.documentId);
        const edits = await setElementStyle(
          session.webContents.id,
          args.selector,
          args.patch,
        );
        assertLensDocumentIdentity(session, args.documentId);
        const target = session.annotations.find(
          (annotation) => annotation.id === args.annotationId,
        );
        if (target?.review.page.documentId === session.documentId) {
          const computedStyles = {
            ...(target.computedStyles ?? {}),
            ...Object.fromEntries(
              edits.map((edit) => [edit.property, edit.after]),
            ),
          };
          const styleEdits = [...(target.styleEdits ?? []), ...edits];
          const [annotation] = normalizeStoredAnnotationsForSession(session, [
            {
              ...target,
              computedStyles,
              styleEdits,
              review: {
                ...target.review,
                anchor: {
                  ...target.review.anchor,
                  computedStyles,
                },
                evidence: {
                  ...target.review.evidence,
                  styleEdits,
                },
              },
            },
          ]);
          if (annotation) {
            session.annotations = session.annotations.map((candidate) =>
              candidate.id === annotation.id ? annotation : candidate,
            );
            sendAnnotationEvent({
              workspaceId: session.workspaceId,
              lensSessionId: session.lensSessionId,
              documentId: session.documentId,
              type: "update",
              annotation,
            });
          }
        }
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      try {
        await assertCdpAllowedForWebContentsId(
          session.webContents.id,
          "attach CDP debugger",
        );
        ensureDebuggerAttached(session.webContents.id);
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
    async (_event, args: { workspaceId: string; lensSessionId?: string }) => {
      const session = getBrowserSession(args.workspaceId, args.lensSessionId);
      if (!session) return { ok: false, message: "No browser session" };

      stopLensCdpDiagnostics(session.webContents.id, true);
      return { ok: true };
    },
  );
}
