/** Host-owned capabilities. Never include these in prompts or renderer options. */
export type StaveCollaborationGrants = {
  consultKey?: string;
  workerKey?: string;
};

export const ADVISOR_GRANT_HEADER = "x-stave-advisor-key";
export const WORKER_GRANT_HEADER = "x-stave-worker-key";
export const ADVISOR_GRANT_ENV = "STAVE_ADVISOR_GRANT_KEY";
export const WORKER_GRANT_ENV = "STAVE_WORKER_GRANT_KEY";

export function collaborationGrantHeaders(grants?: StaveCollaborationGrants) {
  // Explicit empty values clear capabilities retained by resumed MCP clients.
  return {
    [ADVISOR_GRANT_HEADER]: grants?.consultKey ?? "",
    [WORKER_GRANT_HEADER]: grants?.workerKey ?? "",
  };
}

export function readCollaborationGrantHeaders(
  headers: Record<string, string | string[] | undefined>,
): StaveCollaborationGrants {
  const read = (name: string) => {
    const value = headers[name];
    return typeof value === "string" ? value.trim() || undefined : undefined;
  };
  return {
    consultKey: read(ADVISOR_GRANT_HEADER),
    workerKey: read(WORKER_GRANT_HEADER),
  };
}
