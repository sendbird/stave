import type { Session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type {
  LensDownloadEntry,
  LensDownloadEventPayload,
  LensDownloadState,
} from "../../../src/lib/lens/lens.types";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_PAGE_ASSETS = 50;

const requireElectron = createRequire(import.meta.url);
let downloadSequence = 0;

const pendingDownloadRequestsByWebContentsId = new Map<
  number,
  Array<{
    filename?: string;
    resolve: (entry: LensDownloadEntry) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>
>();

function getElectron() {
  return requireElectron("electron") as typeof import("electron");
}

function sanitizePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_");
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "");
  return sanitized || "download";
}

function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/")) {
      return "download";
    }
    const pathname = decodeURIComponent(parsed.pathname);
    const basename = path.basename(pathname);
    return sanitizeFilename(basename || "download");
  } catch {
    return "download";
  }
}

function dedupeFilename(filename: string, existingNames: ReadonlySet<string>) {
  if (!existingNames.has(filename)) {
    return filename;
  }

  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  let index = 1;
  let next = `${stem} (${index})${ext}`;
  while (existingNames.has(next)) {
    index += 1;
    next = `${stem} (${index})${ext}`;
  }
  return next;
}

function existingNamesForDirectory(directory: string): Set<string> {
  try {
    return new Set(fs.readdirSync(directory));
  } catch {
    return new Set();
  }
}

function normalizeDownloadState(value: string): LensDownloadState {
  if (
    value === "progressing" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "interrupted"
  ) {
    return value;
  }
  return "interrupted";
}

function shiftPendingDownloadRequest(webContentsId: number) {
  const queue = pendingDownloadRequestsByWebContentsId.get(webContentsId);
  const request = queue?.shift();
  if (queue && queue.length === 0) {
    pendingDownloadRequestsByWebContentsId.delete(webContentsId);
  }
  return request;
}

export function sendDownloadEvent(
  workspaceId: string,
  entry: LensDownloadEntry,
  lensSessionId?: string,
): void {
  void import("../window").then(({ getMainWindow }) => {
    const renderer = getMainWindow()?.webContents;
    if (!renderer || renderer.isDestroyed()) {
      return;
    }

    renderer.send("lens:download-event", {
      workspaceId,
      lensSessionId,
      entry: { ...entry },
    } satisfies LensDownloadEventPayload);
  });
}

function updateEntryFromItem(
  entry: LensDownloadEntry,
  item: Electron.DownloadItem,
  state: LensDownloadState,
): LensDownloadEntry {
  entry.receivedBytes = item.getReceivedBytes();
  entry.totalBytes = item.getTotalBytes();
  entry.state = state;
  if (state === "completed" || state === "cancelled" || state === "interrupted") {
    entry.completedAt = new Date().toISOString();
  }
  return entry;
}

export function getDownloadsDir(workspaceId: string): string {
  const { app } = getElectron();
  return path.join(
    app.getPath("userData"),
    "lens-downloads",
    sanitizePathSegment(workspaceId),
  );
}

export function deriveDownloadFilename(
  url: string,
  headerName?: string | null,
  existingNames: ReadonlySet<string> = new Set(),
): string {
  const base = sanitizeFilename(headerName?.trim() || filenameFromUrl(url));
  return dedupeFilename(base, existingNames);
}

export function filterDownloadableAssetUrls(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const url = value.trim();
    if (!url || /^data:/i.test(url) || /^blob:/i.test(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

/** Session-scoped routing target for one download on a shared partition. */
export interface LensDownloadTarget {
  workspaceId: string;
  lensSessionId?: string;
  onEntry: (entry: LensDownloadEntry) => void;
}

/**
 * Attach a single will-download listener for one partition. Each download is
 * routed to the lens session that owns the originating webContents via
 * `resolveTarget`; when no session claims it, Electron's default download
 * behavior applies.
 */
export function attachPartitionDownloadHandler(
  ses: Session,
  resolveTarget: (webContentsId: number) => LensDownloadTarget | undefined,
): () => void {
  const handleWillDownload = (
    _event: Electron.Event,
    item: Electron.DownloadItem,
    contents: Electron.WebContents,
  ) => {
    const target = resolveTarget(contents.id);
    if (!target) {
      return;
    }
    const { workspaceId, lensSessionId, onEntry } = target;
    const directory = getDownloadsDir(workspaceId);
    fs.mkdirSync(directory, { recursive: true });

    const pending = shiftPendingDownloadRequest(contents.id);
    const existingNames = existingNamesForDirectory(directory);
    const filename = deriveDownloadFilename(
      item.getURL(),
      pending?.filename ?? item.getFilename(),
      existingNames,
    );
    const savePath = path.join(directory, filename);
    item.setSavePath(savePath);

    const entry: LensDownloadEntry = {
      id: `lens-download-${Date.now()}-${++downloadSequence}`,
      url: item.getURL(),
      filename,
      savePath,
      mimeType: item.getMimeType(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      state: normalizeDownloadState(item.getState()),
      startedAt: new Date().toISOString(),
    };

    onEntry(entry);
    sendDownloadEvent(workspaceId, entry, lensSessionId);

    item.on("updated", (_event, state) => {
      updateEntryFromItem(entry, item, normalizeDownloadState(state));
      sendDownloadEvent(workspaceId, entry, lensSessionId);
    });

    item.once("done", (_event, state) => {
      updateEntryFromItem(entry, item, normalizeDownloadState(state));
      sendDownloadEvent(workspaceId, entry, lensSessionId);

      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      if (entry.state === "completed") {
        pending.resolve({ ...entry });
      } else {
        pending.reject(new Error(`Download ${entry.state}: ${entry.url}`));
      }
    });
  };

  ses.on("will-download", handleWillDownload);
  return () => {
    ses.off("will-download", handleWillDownload);
  };
}

export async function triggerDownloadByUrl(
  webContentsId: number,
  url: string,
  filename?: string,
): Promise<LensDownloadEntry> {
  const { webContents } = getElectron();
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error(`WebContents ${webContentsId} not found or destroyed`);
  }

  return new Promise<LensDownloadEntry>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const queue = pendingDownloadRequestsByWebContentsId.get(webContentsId);
      if (queue) {
        pendingDownloadRequestsByWebContentsId.set(
          webContentsId,
          queue.filter((entry) => entry.resolve !== resolve),
        );
      }
      reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`));
    }, DOWNLOAD_TIMEOUT_MS);

    const queue = pendingDownloadRequestsByWebContentsId.get(webContentsId) ?? [];
    queue.push({ filename, resolve, reject, timeout });
    pendingDownloadRequestsByWebContentsId.set(webContentsId, queue);

    try {
      wc.downloadURL(url);
    } catch (error) {
      clearTimeout(timeout);
      shiftPendingDownloadRequest(webContentsId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function enumeratePageAssets(
  webContentsId: number,
): Promise<string[]> {
  const { evaluateExpression } = await import("./browser-cdp");
  const result = await evaluateExpression(
    webContentsId,
    `(() => {
      const urls = new Set();
      for (const img of document.querySelectorAll("img[src]")) {
        urls.add(img.getAttribute("src"));
      }
      for (const link of document.querySelectorAll("link[rel~='stylesheet'][href]")) {
        urls.add(link.getAttribute("href"));
      }
      for (const script of document.querySelectorAll("script[src]")) {
        urls.add(script.getAttribute("src"));
      }
      return Array.from(urls).map((value) => {
        try {
          return new URL(String(value), document.baseURI).href;
        } catch {
          return null;
        }
      });
    })()`,
  );

  return filterDownloadableAssetUrls(Array.isArray(result) ? result : []).slice(
    0,
    MAX_PAGE_ASSETS,
  );
}
