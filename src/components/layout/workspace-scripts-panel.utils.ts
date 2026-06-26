import { SCRIPT_LOG_HISTORY_LIMIT, SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts";
import type { LensSessionScope } from "@/lib/lens/lens.types";
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

type OrbitLensApi = {
  createView?: (args: {
    workspaceId: string;
    sessionScope?: LensSessionScope;
    projectKey?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  navigate?: (args: {
    workspaceId: string;
    url: string;
  }) => Promise<{ ok: boolean; message?: string }>;
};

type OpenOrbitUrlLayoutPatch = {
  sidebarOverlayVisible: true;
  sidebarOverlayTab: "lens";
  editorVisible?: false;
};

export type OpenOrbitUrlWithLensPriorityResult =
  | { ok: true; target: "lens" }
  | {
      ok: true;
      target: "external";
      reason: "missing-workspace" | "lens-unavailable";
    }
  | { ok: false; target: "lens"; message: string };

export function buildOpenLensLayoutPatch(args: {
  isLargeViewport: boolean;
}): OpenOrbitUrlLayoutPatch {
  return {
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "lens",
    ...(!args.isLargeViewport ? { editorVisible: false as const } : {}),
  };
}

export async function openOrbitUrlWithLensPriority(args: {
  url: string;
  workspaceId?: string | null;
  projectPath?: string | null;
  lensSessionScope: LensSessionScope;
  lensApi?: OrbitLensApi | null;
  isLargeViewport: boolean;
  setLayout: (args: { patch: OpenOrbitUrlLayoutPatch }) => void;
  openExternalUrl: (url: string) => void;
}): Promise<OpenOrbitUrlWithLensPriorityResult> {
  const url = args.url.trim();
  if (!url) {
    return { ok: false, target: "lens", message: "Orbit URL is empty." };
  }

  if (!args.workspaceId) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "missing-workspace" };
  }

  if (!args.lensApi?.createView || !args.lensApi.navigate) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "lens-unavailable" };
  }

  args.setLayout({
    patch: buildOpenLensLayoutPatch({
      isLargeViewport: args.isLargeViewport,
    }),
  });

  try {
    const createResult = await args.lensApi.createView({
      workspaceId: args.workspaceId,
      sessionScope: args.lensSessionScope,
      projectKey: args.projectPath,
    });
    if (!createResult.ok) {
      return {
        ok: false,
        target: "lens",
        message: createResult.message ?? "Lens could not create a browser view.",
      };
    }

    const navigateResult = await args.lensApi.navigate({
      workspaceId: args.workspaceId,
      url,
    });
    if (!navigateResult.ok) {
      return {
        ok: false,
        target: "lens",
        message: navigateResult.message ?? "Lens could not load that Orbit URL.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      target: "lens",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return { ok: true, target: "lens" };
}
