/** Matches `CraneDispatchWorkspaceChoiceSchema` workspaceLabel cap. */
export const DISPATCH_WORKSPACE_LABEL_MAX_LENGTH = 80;

/**
 * Display name proposed for a Run in Stave workspace.
 *
 * The branch stays git-safe; this is the human-facing sidebar label, taken from
 * the issue title and capped so it fits the project list.
 */
export function proposeDispatchWorkspaceLabel(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, DISPATCH_WORKSPACE_LABEL_MAX_LENGTH);
}
