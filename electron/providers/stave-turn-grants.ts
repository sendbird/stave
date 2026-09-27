/** Host-owned turn channels. Never include them in prompts or renderer options. */
export type StaveTurnGrants = {
  consultKey?: string;
  /** Whether the stable consult channel has an active grant this turn. */
  advisorArmed?: boolean;
  workerKey?: string;
  /**
   * Selects the mission stage-reporting tools. The host resolves the mission,
   * stage and attempt from the key's active grant; the model never passes them.
   */
  missionKey?: string;
  /**
   * Selects the project coordinator tools on a coordinator task's turns. The
   * host resolves the project from the key's active grant.
   */
  projectKey?: string;
};

export const ADVISOR_GRANT_HEADER = "x-stave-advisor-key";
export const WORKER_GRANT_HEADER = "x-stave-worker-key";
export const MISSION_GRANT_HEADER = "x-stave-mission-key";
export const PROJECT_GRANT_HEADER = "x-stave-project-key";
export const ADVISOR_GRANT_ENV = "STAVE_ADVISOR_GRANT_KEY";
export const WORKER_GRANT_ENV = "STAVE_WORKER_GRANT_KEY";
export const MISSION_GRANT_ENV = "STAVE_MISSION_GRANT_KEY";
export const PROJECT_GRANT_ENV = "STAVE_PROJECT_GRANT_KEY";

export function turnGrantHeaders(grants?: StaveTurnGrants) {
  // Explicit empty values clear capabilities retained by resumed MCP clients.
  return {
    [ADVISOR_GRANT_HEADER]: grants?.consultKey ?? "",
    [WORKER_GRANT_HEADER]: grants?.workerKey ?? "",
    [MISSION_GRANT_HEADER]: grants?.missionKey ?? "",
    [PROJECT_GRANT_HEADER]: grants?.projectKey ?? "",
  };
}

export function readTurnGrantHeaders(
  headers: Record<string, string | string[] | undefined>,
): StaveTurnGrants {
  const read = (name: string) => {
    const value = headers[name];
    return typeof value === "string" ? value.trim() || undefined : undefined;
  };
  return {
    consultKey: read(ADVISOR_GRANT_HEADER),
    workerKey: read(WORKER_GRANT_HEADER),
    missionKey: read(MISSION_GRANT_HEADER),
    projectKey: read(PROJECT_GRANT_HEADER),
  };
}
