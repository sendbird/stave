// ---------------------------------------------------------------------------
// Workspace Scripts – Renderer Runtime Store (module-level, refcounted)
// ---------------------------------------------------------------------------
//
// A per-workspace store that owns the scripts config, live run state, and the
// single IPC event subscription for a workspace. It deliberately lives outside
// the Zustand app store (per the hot-surface guardrails): the data is
// workspace-local, subscription-driven, and consumed by both React components
// (via `useWorkspaceScriptsRuntime`) and the command palette contributor.
//
// Every snapshot is replaced wholesale — never mutated in place — so
// `useSyncExternalStore` consumers re-render on identity change. Unknown
// workspaces resolve to the shared module-constant `EMPTY_SNAPSHOT` so callers
// never observe a fresh object identity for "nothing here".

import { toast } from "@/components/ui";
import { SCRIPT_TRIGGER_METADATA } from "./constants";
import {
  buildEntryStateFromStatus,
  buildScriptRunFailureState,
  reduceScriptUiState,
  scriptEntryKey,
  type ScriptUiState,
} from "./runtime-state";
import {
  deriveScriptEntryOrigins,
  type ScriptEntryOrigins,
} from "./origins";
import type {
  ResolvedWorkspaceScriptsConfig,
  ScriptKind,
  ScriptHookContext,
  ScriptTrigger,
  WorkspaceScriptEventEnvelope,
} from "./types";

export type ScriptsConfigStatus = "idle" | "loading" | "ready" | "error";

export interface ScriptsRuntimeSnapshot {
  configStatus: ScriptsConfigStatus;
  config: ResolvedWorkspaceScriptsConfig | null;
  configError: string;
  entries: Record<string, ScriptUiState>;
  hookRunningByTrigger: Partial<Record<ScriptTrigger, boolean>>;
  origins: ScriptEntryOrigins;
  revision: number;
}

export interface ScriptsRuntimeContext {
  workspaceId: string;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
}

const EMPTY_ORIGINS: ScriptEntryOrigins = {
  activeTier: null,
  originByKey: {},
  targetOriginById: {},
};

/** Shared identity for "no runtime for this workspace" — never a fresh literal. */
export const EMPTY_SNAPSHOT: ScriptsRuntimeSnapshot = {
  configStatus: "idle",
  config: null,
  configError: "",
  entries: {},
  hookRunningByTrigger: {},
  origins: EMPTY_ORIGINS,
  revision: 0,
};

interface RuntimeRecord {
  context: ScriptsRuntimeContext;
  snapshot: ScriptsRuntimeSnapshot;
  listeners: Set<() => void>;
  refCount: number;
  detachIpc?: () => void;
  refreshToken: number;
}

const records = new Map<string, RuntimeRecord>();
const anyListeners = new Set<() => void>();

function notify(record: RuntimeRecord) {
  for (const listener of record.listeners) {
    listener();
  }
  for (const listener of anyListeners) {
    listener();
  }
}

/** Replace a record's snapshot wholesale, bump revision, and notify listeners. */
function patchSnapshot(
  record: RuntimeRecord,
  patch: Partial<Omit<ScriptsRuntimeSnapshot, "revision">>,
) {
  record.snapshot = {
    ...record.snapshot,
    ...patch,
    revision: record.snapshot.revision + 1,
  };
  notify(record);
}

function getScriptsApi() {
  return typeof window !== "undefined" ? window.api?.scripts : undefined;
}

async function readConfigFile(
  rootPath: string,
  relativePath: string,
): Promise<string | null> {
  const fsApi = typeof window !== "undefined" ? window.api?.fs?.readFile : undefined;
  if (!fsApi) {
    return null;
  }
  try {
    const result = await fsApi({ rootPath, filePath: relativePath });
    return result.ok ? result.content : null;
  } catch {
    return null;
  }
}

async function loadOrigins(context: ScriptsRuntimeContext): Promise<ScriptEntryOrigins> {
  const hasWorkspaceTier =
    Boolean(context.workspacePath) && context.workspacePath !== context.projectPath;
  const baseRel = ".stave/scripts.json";
  const localRel = ".stave/scripts.local.json";

  const [workspaceBase, workspaceLocal, projectBase, projectLocal] = await Promise.all([
    hasWorkspaceTier ? readConfigFile(context.workspacePath, baseRel) : Promise.resolve(null),
    hasWorkspaceTier ? readConfigFile(context.workspacePath, localRel) : Promise.resolve(null),
    readConfigFile(context.projectPath, baseRel),
    readConfigFile(context.projectPath, localRel),
  ]);

  return deriveScriptEntryOrigins({
    workspaceBase,
    workspaceLocal,
    projectBase,
    projectLocal,
  });
}

/** Reload config, status, and origins for a workspace, replacing the snapshot. */
export async function refreshScriptsRuntime(workspaceId: string): Promise<void> {
  const record = records.get(workspaceId);
  if (!record) {
    return;
  }
  const context = record.context;

  if (!context.projectPath || !context.workspacePath) {
    patchSnapshot(record, {
      configStatus: "idle",
      config: null,
      configError: "",
      entries: {},
      origins: EMPTY_ORIGINS,
    });
    return;
  }

  const api = getScriptsApi();
  if (!api?.getConfig || !api.getStatus) {
    patchSnapshot(record, {
      configStatus: "error",
      config: null,
      configError: "Scripts bridge unavailable.",
    });
    return;
  }

  const token = (record.refreshToken += 1);
  patchSnapshot(record, { configStatus: "loading", configError: "" });

  const [configResult, statusResult, origins] = await Promise.all([
    api.getConfig({ projectPath: context.projectPath, workspacePath: context.workspacePath }),
    api.getStatus({ workspaceId }),
    loadOrigins(context),
  ]);

  // A newer refresh (or a release) superseded this one.
  const current = records.get(workspaceId);
  if (!current || current !== record || record.refreshToken !== token) {
    return;
  }

  if (!configResult.ok) {
    patchSnapshot(record, {
      configStatus: "error",
      config: null,
      configError: configResult.error ?? "Failed to load scripts.",
      origins,
    });
    return;
  }

  const entries: Record<string, ScriptUiState> = {};
  if (statusResult.ok) {
    for (const status of statusResult.statuses) {
      entries[scriptEntryKey(status.scriptKind, status.scriptId)] =
        buildEntryStateFromStatus(status);
    }
  }

  patchSnapshot(record, {
    configStatus: "ready",
    config: configResult.config,
    configError: "",
    entries,
    origins,
  });
}

function ingestEvent(workspaceId: string, payload: WorkspaceScriptEventEnvelope) {
  const record = records.get(workspaceId);
  if (!record) {
    return;
  }
  const key = scriptEntryKey(payload.scriptKind, payload.scriptId);
  patchSnapshot(record, {
    entries: {
      ...record.snapshot.entries,
      [key]: reduceScriptUiState(record.snapshot.entries[key], payload),
    },
  });
}

/**
 * Acquire (or create) the runtime for a workspace, refreshing on first
 * acquisition and wiring up the single IPC event subscription. Returns a
 * release function; the record and its subscription are torn down when the
 * last consumer releases.
 */
export function acquireScriptsRuntime(context: ScriptsRuntimeContext): () => void {
  const { workspaceId } = context;
  let record = records.get(workspaceId);

  if (!record) {
    record = {
      context,
      snapshot: { ...EMPTY_SNAPSHOT },
      listeners: new Set(),
      refCount: 0,
      refreshToken: 0,
    };
    records.set(workspaceId, record);

    const subscribe = getScriptsApi()?.subscribeEvents;
    if (subscribe && workspaceId) {
      record.detachIpc = subscribe({ workspaceId }, (payload) => {
        ingestEvent(workspaceId, payload);
      });
    }
  } else {
    // Keep context fresh (project/workspace paths can change between acquires).
    record.context = context;
  }

  record.refCount += 1;
  const acquiredRecord = record;

  if (acquiredRecord.refCount === 1) {
    void refreshScriptsRuntime(workspaceId);
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    acquiredRecord.refCount -= 1;
    if (acquiredRecord.refCount <= 0) {
      acquiredRecord.detachIpc?.();
      records.delete(workspaceId);
    }
  };
}

export function getScriptsRuntimeSnapshot(workspaceId: string | null | undefined): ScriptsRuntimeSnapshot {
  if (!workspaceId) {
    return EMPTY_SNAPSHOT;
  }
  return records.get(workspaceId)?.snapshot ?? EMPTY_SNAPSHOT;
}

export function subscribeScriptsRuntime(
  workspaceId: string | null | undefined,
  listener: () => void,
): () => void {
  if (!workspaceId) {
    return () => {};
  }
  // The record may not exist yet if a subscriber attaches before acquire; guard.
  const attach = () => {
    const record = records.get(workspaceId);
    record?.listeners.add(listener);
  };
  attach();
  return () => {
    records.get(workspaceId)?.listeners.delete(listener);
  };
}

/** Notified whenever any workspace runtime snapshot changes. */
export function subscribeScriptsRuntimeAny(listener: () => void): () => void {
  anyListeners.add(listener);
  return () => {
    anyListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Command functions (own their own toasts)
// ---------------------------------------------------------------------------

export async function runScriptEntry(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}): Promise<void> {
  const record = records.get(args.workspaceId);
  const context = record?.context;
  const api = getScriptsApi()?.runEntry;
  if (!api || !context || !context.projectPath || !context.workspacePath) {
    toast.error("Scripts bridge unavailable");
    return;
  }

  const result = await api({
    workspaceId: args.workspaceId,
    scriptId: args.scriptId,
    scriptKind: args.scriptKind,
    projectPath: context.projectPath,
    workspacePath: context.workspacePath,
    workspaceName: context.workspaceName,
    branch: context.branch || context.workspaceName,
  });

  if (!result.ok) {
    const key = scriptEntryKey(args.scriptKind, args.scriptId);
    const live = records.get(args.workspaceId);
    if (live) {
      patchSnapshot(live, {
        entries: {
          ...live.snapshot.entries,
          [key]: buildScriptRunFailureState({
            existing: live.snapshot.entries[key],
            error: result.error ?? "Unknown error",
          }),
        },
      });
    }
    toast.error("Script failed to start", {
      description: result.error ?? "Unknown error",
    });
    return;
  }

  if (result.alreadyRunning) {
    toast.message("Service already running");
  }
}

export async function stopScriptEntry(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}): Promise<void> {
  const api = getScriptsApi()?.stopEntry;
  if (!api) {
    toast.error("Scripts bridge unavailable");
    return;
  }
  const result = await api({
    workspaceId: args.workspaceId,
    scriptId: args.scriptId,
    scriptKind: args.scriptKind,
  });
  if (!result.ok) {
    toast.error("Failed to stop script", {
      description: result.error ?? "Unknown error",
    });
  }
}

export async function runScriptHook(args: {
  workspaceId: string;
  trigger: ScriptTrigger;
  context?: ScriptHookContext;
}): Promise<void> {
  const record = records.get(args.workspaceId);
  const context = record?.context;
  const api = getScriptsApi()?.runHook;
  if (!api || !context || !context.projectPath || !context.workspacePath) {
    toast.error("Scripts bridge unavailable");
    return;
  }

  const triggerMeta = SCRIPT_TRIGGER_METADATA[args.trigger];
  const setHookRunning = (running: boolean) => {
    const live = records.get(args.workspaceId);
    if (live) {
      patchSnapshot(live, {
        hookRunningByTrigger: {
          ...live.snapshot.hookRunningByTrigger,
          [args.trigger]: running,
        },
      });
    }
  };

  setHookRunning(true);
  try {
    const result = await api({
      workspaceId: args.workspaceId,
      trigger: args.trigger,
      projectPath: context.projectPath,
      workspacePath: context.workspacePath,
      workspaceName: context.workspaceName,
      branch: context.branch || context.workspaceName,
      ...(args.context?.taskId ? { taskId: args.context.taskId } : {}),
      ...(args.context?.taskTitle ? { taskTitle: args.context.taskTitle } : {}),
      ...(args.context?.turnId ? { turnId: args.context.turnId } : {}),
    });
    if (!result.ok) {
      toast.error("Hook execution failed", {
        description: result.error ?? result.summary?.failures[0]?.message ?? "Unknown error",
      });
      return;
    }
    toast.success("Hook executed", {
      description: `${result.summary?.executedEntries ?? 0} script(s) ran for ${triggerMeta.label}.`,
    });
  } finally {
    setHookRunning(false);
  }
}

export async function stopAllScripts(workspaceId: string): Promise<void> {
  const api = getScriptsApi()?.stopAll;
  if (!api) {
    toast.error("Scripts bridge unavailable");
    return;
  }
  const result = await api({ workspaceId });
  if (!result.ok) {
    toast.error("Failed to stop scripts", {
      description: result.error ?? "Unknown error",
    });
  }
}

/** Clear the locally-displayed log for one entry (until the next output event). */
export function clearScriptLog(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}): void {
  const record = records.get(args.workspaceId);
  if (!record) {
    return;
  }
  const key = scriptEntryKey(args.scriptKind, args.scriptId);
  const existing = record.snapshot.entries[key];
  if (!existing) {
    return;
  }
  patchSnapshot(record, {
    entries: {
      ...record.snapshot.entries,
      [key]: { ...existing, log: "" },
    },
  });
}
