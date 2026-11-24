import { ipcMain, webContents } from "electron";
import {
  EXTERNAL_SESSIONS_IPC,
  ExternalSessionsSubscribeArgsSchema,
  type ExternalSessionsSnapshot,
} from "../../../src/lib/external-sessions/external-sessions";
import { getProviderAccountRegistry, systemDirectory } from "../../provider-accounts/registry";
import { ExternalSessionsWatcher } from "../external-sessions/external-sessions-watcher";
import {
  createExternalSessionSubscriptionRegistry,
  removeExternalSessionSubscriber,
  resolveExternalSessionsWatcherMode,
  setExternalSessionSubscriber,
} from "../external-sessions/external-session-subscriptions";
import { ensurePersistenceReadySync } from "../state";

const subscriptions = createExternalSessionSubscriptionRegistry();
const cleanupRegistered = new Set<number>();
const DIRECTORY_CACHE_MS = 60_000;
let directoryCache: { at: number; claude: string[]; codex: string[] } | null = null;

/**
 * Every Claude Code / Codex configuration folder Stave knows: the system
 * default (`$CLAUDE_CONFIG_DIR` or `~/.claude`, `$CODEX_HOME` or `~/.codex`)
 * plus each registered account's folder.
 */
function configDirectories() {
  const now = Date.now();
  if (directoryCache && now - directoryCache.at < DIRECTORY_CACHE_MS) return directoryCache;
  const claude = new Set<string>();
  const codex = new Set<string>();
  try {
    claude.add(systemDirectory("claude-code"));
    codex.add(systemDirectory("codex"));
  } catch {
    // No home folder resolvable: account folders below still count.
  }
  try {
    for (const profile of getProviderAccountRegistry().list()) {
      if (!profile.configDirectory) continue;
      if (profile.providerId === "claude-code") claude.add(profile.configDirectory);
      else if (profile.providerId === "codex") codex.add(profile.configDirectory);
    }
  } catch {
    // Account storage unavailable: the defaults are still watched.
  }
  directoryCache = { at: now, claude: [...claude], codex: [...codex] };
  return directoryCache;
}

function broadcast(snapshot: ExternalSessionsSnapshot) {
  for (const contentsId of [...subscriptions.modeByContentsId.keys()]) {
    const contents = webContents.fromId(contentsId);
    if (!contents || contents.isDestroyed()) {
      removeExternalSessionSubscriber(subscriptions, contentsId);
      continue;
    }
    contents.send(EXTERNAL_SESSIONS_IPC.CHANGED, snapshot);
  }
}

const watcher = new ExternalSessionsWatcher({
  claudeConfigDirs: () => configDirectories().claude,
  codexHomes: () => configDirectories().codex,
  ownedSessionIds: (candidates) =>
    ensurePersistenceReadySync().nativeSessionOwnership.ownedIds(candidates.map((candidate) => candidate.id)),
  onChange: broadcast,
});

/** Worktrees of unfinished sub-agents Activity follows; empty while Activity is off. Read by workspace cleanup. */
export function runningExternalAgentWorktrees(): string[] {
  return watcher.runningAgentWorktrees();
}

function applyMode() {
  const mode = resolveExternalSessionsWatcherMode(subscriptions);
  if (mode === null) directoryCache = null;
  watcher.setMode(mode);
}

function registerCleanup(contentsId: number) {
  if (cleanupRegistered.has(contentsId)) return;
  const contents = webContents.fromId(contentsId);
  if (!contents || contents.isDestroyed()) return;
  cleanupRegistered.add(contentsId);
  contents.once("destroyed", () => {
    cleanupRegistered.delete(contentsId);
    removeExternalSessionSubscriber(subscriptions, contentsId);
    applyMode();
  });
}

/**
 * A renderer subscribes only while Settings > General > Activity outside
 * Stave is on; with no subscriber the watcher is stopped and holds nothing.
 */
export function registerExternalSessionsHandlers() {
  ipcMain.on(EXTERNAL_SESSIONS_IPC.SUBSCRIBE, (event, rawArgs: unknown) => {
    const parsed = ExternalSessionsSubscribeArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return;
    setExternalSessionSubscriber(subscriptions, event.sender.id, parsed.data.mode);
    registerCleanup(event.sender.id);
    applyMode();
    event.sender.send(EXTERNAL_SESSIONS_IPC.CHANGED, watcher.snapshot());
  });
  ipcMain.on(EXTERNAL_SESSIONS_IPC.UNSUBSCRIBE, (event) => {
    removeExternalSessionSubscriber(subscriptions, event.sender.id);
    applyMode();
  });
  ipcMain.handle(EXTERNAL_SESSIONS_IPC.SNAPSHOT, () => watcher.snapshot());
}

