import type { LensSessionScope } from "@/lib/lens/lens.types";
import {
  scriptEntryKey,
  type ScriptUiState,
} from "@/lib/workspace-scripts/runtime-state";
import type { ResolvedWorkspaceScript } from "@/lib/workspace-scripts/types";

// Script run-state reducers/helpers moved to
// `@/lib/workspace-scripts/runtime-state`. This module keeps only the
// Lens/Orbit URL helpers used by the scripts panel.

type OrbitLensApi = {
  openSession?: (args: {
    workspaceId: string;
    lensSessionId: string;
    sessionScope?: LensSessionScope;
    projectKey?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  createView?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    sessionScope?: LensSessionScope;
    projectKey?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  navigate?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    url: string;
  }) => Promise<{ ok: boolean; message?: string }>;
};

export type OpenOrbitUrlWithLensPriorityResult =
  | { ok: true; target: "lens"; lensSessionId: string }
  | {
      ok: true;
      target: "external";
      reason: "missing-workspace" | "lens-unavailable";
    }
  | { ok: false; target: "lens"; message: string };

export interface AutomationRuntimeEntry {
  entry: ResolvedWorkspaceScript;
  state: ScriptUiState;
}

export function partitionAutomationRuntimeEntries(
  entries: ResolvedWorkspaceScript[],
  stateByKey: Record<string, ScriptUiState>,
) {
  const running: AutomationRuntimeEntry[] = [];
  const activity: AutomationRuntimeEntry[] = [];

  for (const entry of entries) {
    const state = stateByKey[scriptEntryKey(entry.kind, entry.id)];
    if (!state) {
      continue;
    }
    if (state.running && entry.kind === "service") {
      running.push({ entry, state });
      continue;
    }
    if (
      state.running ||
      state.endedAt !== undefined ||
      state.exitCode !== undefined ||
      Boolean(state.error) ||
      Boolean(state.log.trim())
    ) {
      activity.push({ entry, state });
    }
  }

  activity.sort((left, right) => {
    if (left.state.running !== right.state.running) {
      return left.state.running ? -1 : 1;
    }
    return (right.state.endedAt ?? 0) - (left.state.endedAt ?? 0);
  });

  return { running, activity };
}

/**
 * Open an Orbit URL inside a lens tab when the Lens bridge is available,
 * falling back to the external browser otherwise.
 *
 * The caller supplies the pane-world integration points so this stays
 * unit-testable:
 * - `resolveLensSessionId` returns the lens tab to reuse (or creates one via
 *   the store) — `null` means no workspace/tab could be resolved.
 * - `focusLensSurface` opens/focuses that lens tab in the pane host.
 */
export async function openOrbitUrlWithLensPriority(args: {
  url: string;
  workspaceId?: string | null;
  projectPath?: string | null;
  lensSessionScope: LensSessionScope;
  lensApi?: OrbitLensApi | null;
  resolveLensSessionId: () => string | null;
  focusLensSurface: (lensSessionId: string) => void;
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

  const lensApi = args.lensApi;
  const openLensSession = lensApi?.openSession ?? lensApi?.createView;
  if (!openLensSession || !lensApi?.navigate) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "lens-unavailable" };
  }

  const lensSessionId = args.resolveLensSessionId();
  if (!lensSessionId) {
    args.openExternalUrl(url);
    return { ok: true, target: "external", reason: "missing-workspace" };
  }

  args.focusLensSurface(lensSessionId);

  try {
    // Opening is idempotent: the mounted lens panel opens the same session,
    // so this only guarantees the session exists before navigating.
    const openResult = await openLensSession({
      workspaceId: args.workspaceId,
      lensSessionId,
      sessionScope: args.lensSessionScope,
      projectKey: args.projectPath,
    });
    if (!openResult.ok) {
      return {
        ok: false,
        target: "lens",
        message: openResult.message ?? "Lens could not create a browser view.",
      };
    }

    const navigateResult = await lensApi.navigate({
      workspaceId: args.workspaceId,
      lensSessionId,
      url,
    });
    if (!navigateResult.ok) {
      return {
        ok: false,
        target: "lens",
        message:
          navigateResult.message ?? "Lens could not load that Orbit URL.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      target: "lens",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return { ok: true, target: "lens", lensSessionId };
}
