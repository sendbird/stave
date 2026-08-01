import type { EditorTab } from "@/types/chat";

export const COMMIT_GRAPH_TITLE = "Commit graph";
export const OPEN_COMMIT_GRAPH_TITLE = "Open commit graph";

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
