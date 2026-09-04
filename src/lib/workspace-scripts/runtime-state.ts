// ---------------------------------------------------------------------------
// Workspace Scripts – Renderer Runtime State (pure reducers/helpers)
// ---------------------------------------------------------------------------

import { SCRIPT_LOG_HISTORY_LIMIT, SCRIPT_TRIGGER_METADATA } from "./constants";
import type {
  ScriptKind,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptRunSource,
  WorkspaceScriptStatusEntry,
} from "./types";

export interface ScriptUiState {
  running: boolean;
  runId?: string;
  sessionId?: string;
  log: string;
  error?: string;
  orbitUrl?: string;
  sourceLabel?: string;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  commandIndex?: number;
  totalCommands?: number;
}

/** Canonical UI key for a script entry: `"<kind>:<id>"`. */
export function scriptEntryKey(kind: ScriptKind, id: string): string {
  return `${kind}:${id}`;
}

/** Count long-running process entries that are currently up. */
export function countRunningServiceEntries(
  entries: Record<string, ScriptUiState>,
): number {
  let count = 0;
  for (const [key, entry] of Object.entries(entries)) {
    if (key.startsWith("service:") && entry.running) {
      count += 1;
    }
  }
  return count;
}

export function appendScriptLog(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= SCRIPT_LOG_HISTORY_LIMIT) {
    return next;
  }
  return next.slice(next.length - SCRIPT_LOG_HISTORY_LIMIT);
}

export function getScriptRunSourceLabel(
  source: WorkspaceScriptRunSource | undefined,
) {
  return source?.kind === "hook"
    ? `Hook · ${SCRIPT_TRIGGER_METADATA[source.trigger].label}`
    : "Manual";
}

export function getScriptSourceLabel(event: WorkspaceScriptEventEnvelope) {
  return getScriptRunSourceLabel(event.source);
}

export function reduceScriptUiState(
  existing: ScriptUiState | undefined,
  payload: WorkspaceScriptEventEnvelope,
  now: number = Date.now(),
): ScriptUiState {
  const current = existing ?? { running: false, log: "" };
  const isNewRun = Boolean(payload.runId && payload.runId !== current.runId);
  const next: ScriptUiState = {
    ...current,
    runId: payload.runId,
    sessionId: payload.sessionId,
    sourceLabel: getScriptSourceLabel(payload),
  };

  switch (payload.event.type) {
    case "started":
      next.running = true;
      next.error = undefined;
      next.endedAt = undefined;
      next.exitCode = undefined;
      next.commandIndex = payload.event.commandIndex;
      next.totalCommands = payload.event.totalCommands;
      if (isNewRun || current.startedAt === undefined) {
        next.startedAt = now;
      }
      if (isNewRun) {
        next.log = "";
        next.orbitUrl = undefined;
      }
      break;
    case "orbit-url":
      next.orbitUrl = payload.event.url;
      break;
    case "output":
      next.log = appendScriptLog(current.log, payload.event.data);
      break;
    case "command-completed":
      next.commandIndex = payload.event.commandIndex;
      break;
    case "error":
      next.running = false;
      next.error = payload.event.error;
      next.endedAt = now;
      break;
    case "completed":
      next.running = false;
      next.endedAt = now;
      next.exitCode = payload.event.exitCode;
      if (payload.event.exitCode !== 0 && !next.error) {
        next.error = `Exited with code ${payload.event.exitCode}.`;
      }
      break;
    case "stopped":
      next.running = false;
      next.endedAt = now;
      break;
    default:
      break;
  }

  return next;
}

/**
 * Map a host-service status entry into UI state.
 *
 * `getStatus` snapshots carry no timestamps, so restored runs render without
 * durations until the next live event arrives.
 */
export function buildEntryStateFromStatus(
  status: WorkspaceScriptStatusEntry,
): ScriptUiState {
  return {
    running: status.running,
    runId: status.runId,
    sessionId: status.sessionId,
    log: status.log,
    error: status.error,
    orbitUrl: status.orbitUrl,
    sourceLabel: getScriptRunSourceLabel(status.source),
  };
}

export function buildScriptRunFailureState(args: {
  existing: ScriptUiState | undefined;
  error: string;
  sourceLabel?: string;
}): ScriptUiState {
  return {
    running: false,
    runId: args.existing?.runId,
    sessionId: args.existing?.sessionId,
    log: args.existing?.log ?? "",
    error: args.error,
    orbitUrl: undefined,
    sourceLabel: args.sourceLabel ?? args.existing?.sourceLabel ?? "Manual",
  };
}

export function formatScriptDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "";
  }
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60_000) {
    const seconds = durationMs / 1_000;
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatScriptRelativeTime(
  timestampMs: number,
  now: number = Date.now(),
): string {
  const elapsed = Math.max(0, now - timestampMs);
  if (elapsed < 5_000) {
    return "just now";
  }
  if (elapsed < 60_000) {
    return `${Math.round(elapsed / 1_000)}s ago`;
  }
  if (elapsed < 3_600_000) {
    return `${Math.round(elapsed / 60_000)}m ago`;
  }
  if (elapsed < 86_400_000) {
    return `${Math.round(elapsed / 3_600_000)}h ago`;
  }
  return `${Math.round(elapsed / 86_400_000)}d ago`;
}
