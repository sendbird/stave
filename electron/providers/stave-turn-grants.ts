/** Host-owned turn channels. Never include them in prompts or renderer options. */
export type StaveTurnGrants = {
  /**
   * Selects the mission stage-reporting tools. The host resolves the mission,
   * stage and attempt from the key's active grant; the model never passes them.
   */
  missionKey?: string;
  /**
   * Names the calling task and turn to every Local MCP tool. The host
   * resolves it in `caller-grants.ts`; tools never trust a model-typed id.
   */
  callerKey?: string;
};

export const MISSION_GRANT_HEADER = "x-stave-mission-key";
export const CALLER_GRANT_HEADER = "x-stave-caller-key";
export const MISSION_GRANT_ENV = "STAVE_MISSION_GRANT_KEY";
export const CALLER_GRANT_ENV = "STAVE_CALLER_GRANT_KEY";

export function turnGrantHeaders(grants?: StaveTurnGrants) {
  // Explicit empty values clear capabilities retained by resumed MCP clients.
  return {
    [MISSION_GRANT_HEADER]: grants?.missionKey ?? "",
    [CALLER_GRANT_HEADER]: grants?.callerKey ?? "",
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
    missionKey: read(MISSION_GRANT_HEADER),
    callerKey: read(CALLER_GRANT_HEADER),
  };
}
