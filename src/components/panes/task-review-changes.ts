import { useMemo } from "react";
import { summarizeDiffLineChanges, type DiffLineChangeSummary } from "@/components/session/chat-panel.utils";
import { findLatestFinishedTurnId } from "@/lib/fleet/result-auto-review";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, CodeDiffPart } from "@/types/chat";

/** What the latest finished turn changed, as Review opens on it by default. */
export interface TurnChangeSummary {
  added: number;
  removed: number;
  files: number;
}

// A diff part never changes once written, so its line count is computed once.
const partSummaries = new WeakMap<CodeDiffPart, DiffLineChangeSummary>();

function summarizePart(part: CodeDiffPart): DiffLineChangeSummary {
  const cached = partSummaries.get(part);
  if (cached) return cached;
  const summary = summarizeDiffLineChanges({ oldContent: part.oldContent, newContent: part.newContent });
  partSummaries.set(part, summary);
  return summary;
}

/**
 * The lines and files a turn's agent reported changing, counted the way the
 * turn's changed-files card counts them, or `null` when it changed nothing.
 */
export function summarizeTurnChanges(messages: readonly ChatMessage[] | undefined, turnId: string | null): TurnChangeSummary | null {
  if (!messages || !turnId) return null;
  const paths = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const message of messages) {
    if (message.turnId !== turnId) continue;
    for (const part of message.parts) {
      if (part.type !== "code_diff") continue;
      const summary = summarizePart(part);
      added += summary.added;
      removed += summary.removed;
      paths.add(part.filePath);
    }
  }
  return paths.size > 0 ? { added, removed, files: paths.size } : null;
}

/** The latest finished turn's changes for the task, for the Review switch's count. */
export function useLatestTurnChanges(taskId: string): TurnChangeSummary | null {
  const messages = useAppStore((state) => state.messagesByTask[taskId]);
  const activeTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  return useMemo(
    () => summarizeTurnChanges(messages, findLatestFinishedTurnId(messages, activeTurnId)),
    [messages, activeTurnId],
  );
}
