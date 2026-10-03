/** Host-owned turn channels. Never include them in prompts or renderer options. */
export type StaveTurnGrants = {
  /**
   * Selects the agent run stage-reporting tools. The host resolves the agent run,
   * stage and attempt from the key's active grant; the model never passes them.
   */
  agentRunKey?: string;
  /**
   * Names the calling task and turn to every Local MCP tool. The host
   * resolves it in `caller-grants.ts`; tools never trust a model-typed id.
   */
  callerKey?: string;
};

export const AGENT_RUN_GRANT_HEADER = "x-stave-agent-run-key";
export const CALLER_GRANT_HEADER = "x-stave-caller-key";
export const AGENT_RUN_GRANT_ENV = "STAVE_AGENT_RUN_GRANT_KEY";
export const CALLER_GRANT_ENV = "STAVE_CALLER_GRANT_KEY";

export function turnGrantHeaders(grants?: StaveTurnGrants) {
  // Explicit empty values clear capabilities retained by resumed MCP clients.
  return {
    [AGENT_RUN_GRANT_HEADER]: grants?.agentRunKey ?? "",
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
    agentRunKey: read(AGENT_RUN_GRANT_HEADER),
    callerKey: read(CALLER_GRANT_HEADER),
  };
}
