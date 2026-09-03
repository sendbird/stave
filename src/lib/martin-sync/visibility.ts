import type { AtelierConnectorPublicStatus } from "../atelier-connector/types";
import type { WorkspaceMartinProjectLink } from "../workspace-information";

export function isMartinConnectorPaired(
  status:
    Pick<AtelierConnectorPublicStatus, "paired" | "scopes"> | null | undefined,
): boolean {
  return status?.paired === true && status.scopes.includes("martin");
}

/**
 * The Information-panel Martin card stays hidden until the person has turned
 * Martin sync on, paired the connector with the Martin scope, or already
 * linked a project. A leftover link must remain visible so unlink/refresh
 * stay reachable after sync is turned off.
 */
export function isMartinInformationCardAvailable(args: {
  martinSyncEnabled?: boolean;
  martinConnectorPaired?: boolean;
  martinProject?: WorkspaceMartinProjectLink | null;
}): boolean {
  return (
    Boolean(args.martinSyncEnabled) ||
    Boolean(args.martinConnectorPaired) ||
    Boolean(args.martinProject)
  );
}
