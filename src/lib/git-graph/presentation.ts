import type { I18nKey } from "@/i18n/runtime";
import type { EditorTab } from "@/types/chat";

// i18n-ignore: stable persisted editor-tab filePath discriminator
export const COMMIT_GRAPH_TITLE = "Commit graph";
export const COMMIT_GRAPH_TITLE_KEY = "gitGraph:gitGraphCanvas.commitGraph" satisfies I18nKey;
export const OPEN_COMMIT_GRAPH_TITLE_KEY = "gitGraph:presentation.openCommitGraph" satisfies I18nKey;

/** Revision segment used by the commit graph's uncommitted-changes selection. */
export const COMMIT_GRAPH_WORKING_TREE_REVISION = "working-tree" as const;

export const COMMIT_GRAPH_DIFF_TAB_PREFIX = "git-graph-diff:";

/**
 * Deterministic editor-tab id for a file diff opened from the commit graph.
 *
 * `isSnapshotDiffEditorTab` in `@/lib/editor/snapshot-diff-tabs` reads this id
 * back to decide whether the tab is a frozen snapshot, so the two must stay
 * built from the same prefix and revision token.
 */
export function commitGraphDiffTabId(args: {
  revision: string;
  filePath: string;
}): string {
  return `${COMMIT_GRAPH_DIFF_TAB_PREFIX}${args.revision}:${encodeURIComponent(args.filePath)}`;
}

export function normalizeGitGraphEditorTabs(
  editorTabs: EditorTab[],
): EditorTab[] {
  let changed = false;
  const normalizedTabs = editorTabs.map((tab) => {
    if (tab.kind !== "git-graph" || tab.filePath === COMMIT_GRAPH_TITLE) {
      return tab;
    }
    changed = true;
    return { ...tab, filePath: COMMIT_GRAPH_TITLE };
  });
  return changed ? normalizedTabs : editorTabs;
}
