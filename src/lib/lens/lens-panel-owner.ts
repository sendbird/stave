/**
 * Which workspace a Lens panel belongs to.
 *
 * A panel is created for the workspace that was active when it mounted and
 * keeps that identity until it is torn down. The one exception is a mount that
 * happened before any workspace was active, which adopts the first one that
 * becomes so; after that the owner never follows the active workspace again.
 */
export function resolveLensPanelOwnerWorkspaceId(args: {
  ownerWorkspaceId: string;
  activeWorkspaceId: string;
}): string {
  return args.ownerWorkspaceId || args.activeWorkspaceId;
}
