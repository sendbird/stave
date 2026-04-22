import { app } from "electron";
import path from "node:path";
import { disposeAllLspSessions } from "./lsp/session-manager";
import { destroyAllBrowserSessions } from "./browser/browser-manager";
import { getMainWindow } from "./window";
import {
  bindTerminalSessionSlot,
  clearTerminalSessionSlotRegistry,
  createTerminalSessionSlotRegistry,
  getTerminalSessionIdForSlotKey as lookupTerminalSessionIdForSlotKey,
  unbindTerminalSessionSlotBySessionId,
  unbindTerminalSessionSlotBySlotKey,
} from "./terminal-session-slot-registry";
import { SqliteStore } from "../persistence/sqlite-store";
import type { TerminalSession } from "./types";
import type { PersistenceBootstrapStatus } from "../../src/lib/persistence/bootstrap-status";
import { IDLE_PERSISTENCE_BOOTSTRAP_STATUS } from "../../src/lib/persistence/bootstrap-status";

const terminalSessions = new Map<string, TerminalSession>();
const terminalSessionSlotRegistry = createTerminalSessionSlotRegistry();
let sqliteStore: SqliteStore | null = null;
let persistenceBootstrapStatus: PersistenceBootstrapStatus =
  IDLE_PERSISTENCE_BOOTSTRAP_STATUS;
const TERMINAL_SESSION_CLOSE_TIMEOUT_MS = 5_000;

export function getTerminalSession(sessionId: string) {
  return terminalSessions.get(sessionId);
}

export function getTerminalSessionIdForSlotKey(slotKey: string) {
  const sessionId = lookupTerminalSessionIdForSlotKey({
    registry: terminalSessionSlotRegistry,
    slotKey,
  });
  if (!sessionId) {
    return null;
  }

  if (terminalSessions.has(sessionId)) {
    return sessionId;
  }

  unbindTerminalSessionSlotBySlotKey({
    registry: terminalSessionSlotRegistry,
    slotKey,
  });
  return null;
}

export function setTerminalSession(
  sessionId: string,
  session: TerminalSession,
  slotKey?: string,
) {
  terminalSessions.set(sessionId, session);
  if (slotKey) {
    bindTerminalSessionSlot({
      registry: terminalSessionSlotRegistry,
      sessionId,
      slotKey,
    });
  }
}

export function deleteTerminalSession(sessionId: string) {
  terminalSessions.delete(sessionId);
  unbindTerminalSessionSlotBySessionId({
    registry: terminalSessionSlotRegistry,
    sessionId,
  });
}

function waitForTerminalSessionClose(session: TerminalSession) {
  return Promise.race([
    session.closed,
    new Promise<void>((resolve) => {
      setTimeout(resolve, TERMINAL_SESSION_CLOSE_TIMEOUT_MS);
    }),
  ]);
}

export async function cleanupAllTerminalSessions() {
  const sessions = [...terminalSessions.values()];
  terminalSessions.clear();
  clearTerminalSessionSlotRegistry({ registry: terminalSessionSlotRegistry });

  await Promise.allSettled(
    sessions.map(async (session) => {
      session.close();
      await waitForTerminalSessionClose(session);
    }),
  );
}

export async function ensurePersistenceReady() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  sqliteStore = new SqliteStore({
    dbPath,
    onBootstrapStatusChange: setPersistenceBootstrapStatus,
  });
  return sqliteStore;
}

export function ensurePersistenceReadySync() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  sqliteStore = new SqliteStore({
    dbPath,
    onBootstrapStatusChange: setPersistenceBootstrapStatus,
  });
  return sqliteStore;
}

export function getPersistenceBootstrapStatus() {
  return persistenceBootstrapStatus;
}

function setPersistenceBootstrapStatus(status: PersistenceBootstrapStatus) {
  persistenceBootstrapStatus = status;
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send("persistence:bootstrap-status", status);
}

export function resetMainProcessState() {
  terminalSessions.clear();
  clearTerminalSessionSlotRegistry({ registry: terminalSessionSlotRegistry });
  void disposeAllLspSessions();
  destroyAllBrowserSessions();
  sqliteStore = null;
  persistenceBootstrapStatus = IDLE_PERSISTENCE_BOOTSTRAP_STATUS;
}
