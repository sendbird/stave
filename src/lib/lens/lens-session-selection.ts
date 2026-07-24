import { DEFAULT_LENS_SESSION_ID } from "@/lib/lens/lens.types";

export interface LensSessionSelectionCandidate {
  lensSessionId: string;
  managedByMcp: boolean;
  visible: boolean;
  lastVisibleAt: number;
}

export interface LensProjectCandidate {
  projectPath: string;
  workspaces: ReadonlyArray<{ id: string }>;
}

function sortByRecentVisibility<Session extends LensSessionSelectionCandidate>(
  sessions: ReadonlyArray<Session>,
): Session[] {
  return [...sessions].sort(
    (left, right) => right.lastVisibleAt - left.lastVisibleAt,
  );
}

/**
 * Resolve an omitted MCP session id to the Lens tab the user is already using.
 * Explicit ids never fall back to another tab.
 */
export function selectPreferredLensSession<
  Session extends LensSessionSelectionCandidate,
>(
  sessions: ReadonlyArray<Session>,
  lensSessionId?: string | null,
): Session | undefined {
  const explicitId = lensSessionId?.trim();
  if (explicitId) {
    return sessions.find((session) => session.lensSessionId === explicitId);
  }

  const recent = sortByRecentVisibility(sessions);
  return (
    recent.find((session) => session.visible && !session.managedByMcp) ??
    recent.find((session) => session.visible) ??
    recent.find((session) => !session.managedByMcp) ??
    sessions.find(
      (session) => session.lensSessionId === DEFAULT_LENS_SESSION_ID,
    ) ??
    recent[0]
  );
}

export function findLensProjectKeyForWorkspace(
  projects: ReadonlyArray<LensProjectCandidate>,
  workspaceId: string,
): string | undefined {
  return projects.find((project) =>
    project.workspaces.some((workspace) => workspace.id === workspaceId),
  )?.projectPath;
}
