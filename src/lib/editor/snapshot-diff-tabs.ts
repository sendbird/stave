import {
  COMMIT_GRAPH_DIFF_TAB_PREFIX,
  COMMIT_GRAPH_WORKING_TREE_REVISION,
} from "@/lib/git-graph/presentation";
import type { EditorTab } from "@/types/chat";
import { GITHUB_PR_DIFF_TAB_PREFIX } from "@/lib/github-pr-review";

const CHAT_DIFF_TAB_PREFIX = "chat-diff:";

/**
 * Deterministic editor-tab id for a file diff opened from a chat message.
 *
 * Keyed by message and part index so re-opening the same recorded edit reuses
 * one tab while two edits to the same file in different turns stay distinct.
 */
export function chatDiffTabId(args: {
  messageId: string;
  index: number;
  filePath: string;
}): string {
  return `${CHAT_DIFF_TAB_PREFIX}${args.messageId}:${args.index}:${args.filePath}`;
}

/**
 * True when NEITHER side of the diff is the file on disk, so `filePath` is a
 * label rather than a live handle. Both sides are frozen snapshots taken at
 * some earlier point:
 *
 * - `chat-diff:` holds the content recorded before and after an agent edit, as
 *   old as the message it belongs to.
 * - `github-pr-diff:` holds a file patch for one immutable PR head commit.
 * - `git-graph-diff:<revision>:` holds two immutable git objects.
 *
 * Such a tab must never be refreshed from the working tree (that would swap the
 * recorded change out of the modified side) and must never be saved (that would
 * revert every change made to the file since the snapshot was taken, with no
 * conflict raised — the tab's revision anchor is only as old as the tab).
 *
 * Excluded, because there the modified side IS the file on disk and both
 * refreshing and saving stay correct:
 *
 * - `git-graph-diff:working-tree:` — the commit graph's uncommitted-changes view
 * - `scm-diff:` — the source control working-tree diff
 */
export function isSnapshotDiffEditorTab(
  tab: Pick<EditorTab, "id"> | null | undefined,
): boolean {
  if (!tab) {
    return false;
  }
  if (tab.id.startsWith(CHAT_DIFF_TAB_PREFIX)) {
    return true;
  }
  if (tab.id.startsWith(GITHUB_PR_DIFF_TAB_PREFIX)) {
    return true;
  }
  if (!tab.id.startsWith(COMMIT_GRAPH_DIFF_TAB_PREFIX)) {
    return false;
  }
  return !tab.id.startsWith(
    `${COMMIT_GRAPH_DIFF_TAB_PREFIX}${COMMIT_GRAPH_WORKING_TREE_REVISION}:`,
  );
}
