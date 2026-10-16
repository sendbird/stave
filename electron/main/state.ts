import { app } from "electron";
import path from "node:path";
import { disposeAllLspSessions } from "./lsp/session-manager";
import { destroyAllBrowserSessions } from "./browser/browser-manager";
import { getMainWindow } from "./window";
import { SqliteStore } from "../persistence/sqlite-store";
import type { SqliteStorageMetrics } from "../persistence/sqlite-maintenance-policy";
import type { PersistenceBootstrapStatus } from "../../src/lib/persistence/bootstrap-status";
import { IDLE_PERSISTENCE_BOOTSTRAP_STATUS } from "../../src/lib/persistence/bootstrap-status";

let sqliteStore: SqliteStore | null = null;
let persistenceBootstrapStatus: PersistenceBootstrapStatus =
  IDLE_PERSISTENCE_BOOTSTRAP_STATUS;

export async function ensurePersistenceReady() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  const store = new SqliteStore({
    dbPath,
    onBootstrapStatusChange: setPersistenceBootstrapStatus,
  });
  store.reconcileInterruptedRuns({ now: new Date().toISOString() });
  sqliteStore = store;
  return sqliteStore;
}

export function ensurePersistenceReadySync() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  const store = new SqliteStore({
    dbPath,
    onBootstrapStatusChange: setPersistenceBootstrapStatus,
  });
  store.reconcileInterruptedRuns({ now: new Date().toISOString() });
  sqliteStore = store;
  return sqliteStore;
}

export function getPersistenceBootstrapStatus() {
  return persistenceBootstrapStatus;
}

export function getPersistenceStorageMetrics(): SqliteStorageMetrics | null {
  return sqliteStore?.getStorageMetrics() ?? null;
}

function setPersistenceBootstrapStatus(status: PersistenceBootstrapStatus) {
  persistenceBootstrapStatus = status;
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send("persistence:bootstrap-status", status);
}

export async function resetMainProcessState(options?: {
  compactPersistence?: boolean;
}) {
  await Promise.allSettled([
    disposeAllLspSessions(),
    destroyAllBrowserSessions(),
  ]);
  sqliteStore?.close({ compactStorage: options?.compactPersistence });
  sqliteStore = null;
  persistenceBootstrapStatus = IDLE_PERSISTENCE_BOOTSTRAP_STATUS;
}
