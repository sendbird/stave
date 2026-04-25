// ---------------------------------------------------------------------------
// Workspace Scripts – Process State (Electron main process)
// ---------------------------------------------------------------------------

import type { ChildProcess } from "node:child_process";
import type * as pty from "node-pty";
import type {
  ScriptKind,
  WorkspaceScriptEvent,
  WorkspaceScriptRunSource,
  WorkspaceScriptStatusEntry,
} from "../../../src/lib/workspace-scripts/types";
import { SCRIPT_LOG_HISTORY_LIMIT } from "../../../src/lib/workspace-scripts/constants";

export interface WorkspaceScriptProcess {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  source: WorkspaceScriptRunSource;
  process: ChildProcess | pty.IPty | null;
  aborted: boolean;
  sessionId?: string;
  log: string;
  error?: string;
  orbitUrl?: string;
  cleanup?: () => void;
}

const workspaceScriptProcesses = new Map<string, WorkspaceScriptProcess>();

export function getScriptProcessKey(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}) {
  return `${args.workspaceId}:${args.scriptKind}:${args.scriptId}`;
}

export function getWorkspaceScriptProcess(key: string): WorkspaceScriptProcess | undefined {
  return workspaceScriptProcesses.get(key);
}

export function setWorkspaceScriptProcess(key: string, entry: WorkspaceScriptProcess): void {
  workspaceScriptProcesses.set(key, entry);
}

export function deleteWorkspaceScriptProcess(key: string): void {
  const entry = workspaceScriptProcesses.get(key);
  if (entry?.cleanup) {
    const cleanup = entry.cleanup;
    entry.cleanup = undefined;
    cleanup();
  }
  workspaceScriptProcesses.delete(key);
}

export function listWorkspaceScriptProcessKeys(): string[] {
  return [...workspaceScriptProcesses.keys()];
}

export function listWorkspaceScriptProcessesForWorkspace(workspaceId: string): WorkspaceScriptProcess[] {
  return [...workspaceScriptProcesses.values()].filter((entry) => entry.workspaceId === workspaceId);
}

function appendLog(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= SCRIPT_LOG_HISTORY_LIMIT) {
    return next;
  }
  return next.slice(next.length - SCRIPT_LOG_HISTORY_LIMIT);
}

export function recordWorkspaceScriptEvent(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  event: WorkspaceScriptEvent;
}): void {
  const entry = getWorkspaceScriptProcess(getScriptProcessKey(args));
  if (!entry || entry.runId !== args.runId) {
    return;
  }

  switch (args.event.type) {
    case "output":
      entry.log = appendLog(entry.log, args.event.data);
      break;
    case "orbit-url":
      entry.orbitUrl = args.event.url;
      break;
    case "error":
      entry.error = args.event.error;
      break;
    default:
      break;
  }
}

export function getWorkspaceScriptStatusesForWorkspace(workspaceId: string): WorkspaceScriptStatusEntry[] {
  return listWorkspaceScriptProcessesForWorkspace(workspaceId).map((entry) => ({
    scriptId: entry.scriptId,
    scriptKind: entry.scriptKind,
    running: !entry.aborted,
    log: entry.log,
    runId: entry.runId,
    sessionId: entry.sessionId,
    error: entry.error,
    orbitUrl: entry.orbitUrl,
    source: entry.source,
  }));
}

export function clearWorkspaceScriptProcesses(): void {
  workspaceScriptProcesses.clear();
}
