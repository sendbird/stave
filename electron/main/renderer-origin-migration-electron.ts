// temporary-migration: renderer-origin-storage
import { BrowserWindow, session } from "electron";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RENDERER_ORIGIN, RENDERER_SCHEME } from "./renderer-entry";
import {
  runRendererOriginStorageMigration,
  type RendererOriginMigrationResult,
  type StorageEntries,
} from "./renderer-origin-migration";

const MARKER_FILE_NAME = "renderer-origin-migration.json";
const MIGRATION_PAGE_PATH = "/__stave/origin-migration.html";
const MIGRATION_PAGE_HTML = "<!doctype html><meta charset=\"utf-8\"><title></title>";
const MIGRATION_TIMEOUT_MS = 15_000;

let profileHadPersistenceAtStartup: boolean | null = null;

/**
 * Record whether an earlier Stave already used this profile. Every release
 * that loaded the renderer from file:// also created `stave.sqlite`, so its
 * absence before anything opens the store means there is nothing to copy.
 * Chromium creates `Local Storage` itself at startup, so that directory says
 * nothing. Call before the SQLite store can be opened.
 */
export function recordRendererOriginMigrationBaseline(userDataPath: string) {
  profileHadPersistenceAtStartup = existsSync(
    path.join(userDataPath, "stave.sqlite"),
  );
}

const READ_ALL_ENTRIES = `(() => {
  const entries = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) entries.push([key, localStorage.getItem(key) ?? ""]);
  }
  return entries;
})()`;

/** The blank page the migration opens at the renderer origin; never the app. */
export function serveRendererMigrationPage(requestUrl: string): Response | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== `${RENDERER_SCHEME}:` ||
    url.pathname !== MIGRATION_PAGE_PATH
  ) {
    return null;
  }
  return new Response(MIGRATION_PAGE_HTML, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Run the copy with hidden pages in the default session.
 *
 * The caller must already own a window: Stave has no `window-all-closed`
 * handler, so destroying the last hidden page with no other window would quit
 * the app.
 */
export function migrateRendererOriginStorage(args: {
  userDataPath: string;
  tempPath: string;
}): Promise<RendererOriginMigrationResult> {
  const markerPath = path.join(args.userDataPath, MARKER_FILE_NAME);
  const pages = new Set<BrowserWindow>();
  const temporaryDirectories = new Set<string>();

  async function evaluateInHiddenPage<T>(
    load: (page: BrowserWindow) => Promise<void>,
    script: string,
  ): Promise<T> {
    const page = new BrowserWindow({
      show: false,
      paintWhenInitiallyHidden: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    pages.add(page);
    try {
      await load(page);
      return (await page.webContents.executeJavaScript(script)) as T;
    } finally {
      pages.delete(page);
      if (!page.isDestroyed()) page.destroy();
    }
  }

  const loadTarget = (page: BrowserWindow) =>
    page.loadURL(`${RENDERER_ORIGIN}${MIGRATION_PAGE_PATH}`);

  return runRendererOriginStorageMigration(
    {
      hasMarker: () => existsSync(markerPath),
      profileMayHaveLegacyStorage: () => profileHadPersistenceAtStartup ?? true,
      readSource: () =>
        evaluateInHiddenPage<StorageEntries>(async (page) => {
          // Every file:// document shares one localStorage origin.
          const directory = mkdtempSync(
            path.join(args.tempPath, "stave-origin-migration-"),
          );
          temporaryDirectories.add(directory);
          const pagePath = path.join(directory, "origin-migration.html");
          writeFileSync(pagePath, MIGRATION_PAGE_HTML);
          await page.loadFile(pagePath);
        }, READ_ALL_ENTRIES),
      writeTarget: (entries) =>
        evaluateInHiddenPage<void>(
          loadTarget,
          `(() => {
            for (const [key, value] of ${JSON.stringify(entries)}) {
              localStorage.setItem(key, value);
            }
          })()`,
        ),
      readTarget: () =>
        evaluateInHiddenPage<StorageEntries>(loadTarget, READ_ALL_ENTRIES),
      flush: async () => {
        session.defaultSession.flushStorageData();
      },
      writeMarker: (summary) => {
        const temporaryPath = `${markerPath}.tmp`;
        writeFileSync(
          temporaryPath,
          JSON.stringify({ version: 1, origin: RENDERER_ORIGIN, ...summary }),
        );
        renameSync(temporaryPath, markerPath);
      },
      dispose: () => {
        for (const page of pages) {
          if (!page.isDestroyed()) page.destroy();
        }
        pages.clear();
        for (const directory of temporaryDirectories) {
          rmSync(directory, { recursive: true, force: true });
        }
        temporaryDirectories.clear();
      },
    },
    { timeoutMs: MIGRATION_TIMEOUT_MS },
  );
}
