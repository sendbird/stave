import { SCRIPT_LOG_HISTORY_LIMIT, SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts";
import type { WorkspaceScriptEventEnvelope } from "@/lib/workspace-scripts/types";

export interface ScriptUiState {
  running: boolean;
  runId?: string;
  sessionId?: string;
  log: string;
  error?: string;
  orbitUrl?: string;
  sourceLabel?: string;
}

export function appendScriptLog(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= SCRIPT_LOG_HISTORY_LIMIT) {
    return next;
  }
  return next.slice(next.length - SCRIPT_LOG_HISTORY_LIMIT);
}

export function getScriptSourceLabel(event: WorkspaceScriptEventEnvelope) {
  return event.source.kind === "hook"
    ? `Hook · ${SCRIPT_TRIGGER_METADATA[event.source.trigger].label}`
    : "Manual";
}

export function reduceScriptUiState(
  existing: ScriptUiState | undefined,
  payload: WorkspaceScriptEventEnvelope,
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
    case "error":
      next.running = false;
      next.error = payload.event.error;
      break;
    case "completed":
      next.running = false;
      if (payload.event.exitCode !== 0 && !next.error) {
        next.error = `Exited with code ${payload.event.exitCode}.`;
      }
      break;
    case "stopped":
      next.running = false;
      break;
    default:
      break;
  }

  return next;
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
