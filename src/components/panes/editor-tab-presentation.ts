import type { EditorTab } from "@/types/chat";

type EditorTabKindCarrier = Pick<EditorTab, "kind">;

export function isGitGraphEditorTab(
  tab: EditorTabKindCarrier | null | undefined,
): boolean {
  return tab?.kind === "git-graph";
}

export function shouldShowEditorFileActions<T extends EditorTabKindCarrier>(
  tab: T | null | undefined,
): tab is T {
  return Boolean(tab && !isGitGraphEditorTab(tab));
}
