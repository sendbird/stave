import { useEffect, useMemo, useState } from "react";
import {
  REVIEW_FINDINGS_FENCE,
  type ParsedReviewFindings,
} from "@/lib/reviews/review-findings";
import { parseReviewFindingsForPrompt } from "@/lib/reviews/review-recheck-context";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";
import { useAppStore } from "@/store/app.store";
import { readAttachedTaskMessages } from "@/store/attached-task-context-runtime";
import { summarizeReviewTranscript, type ReviewTranscript } from "./composer-shelf.utils";

/**
 * Finished transcripts by review task and settle time. Message synchronization
 * can lag ledger completion, so a loaded message update invalidates the cache.
 */
const settledTranscripts = new Map<string, ReviewTranscript>();
const MAX_CACHED = 50;

function cacheKey(item: ReviewShelfItem) {
  return item.status === "running"
    ? null
    : `${item.child.delegatedTaskId}:${item.child.completedAt ?? item.child.updatedAt}`;
}

export interface ReviewTranscriptState {
  transcript: ReviewTranscript | null;
  /** The structured findings once the reply is read; null while reading or running. */
  findings: ParsedReviewFindings | null;
}

/**
 * A review task's prompt and final reply, read from the task (or its newest
 * stored page), with the ledger's bounded answer as a fallback. Running
 * reviews are read too, for their prompt, but never cached.
 */
export function useReviewTranscript(
  item: ReviewShelfItem,
  options: { enabled?: boolean } = {},
): ReviewTranscriptState {
  const enabled = options.enabled ?? true;
  const key = cacheKey(item);
  const [loaded, setLoaded] = useState<{ key: string; transcript: ReviewTranscript } | null>(
    () => (key && settledTranscripts.has(key) ? { key, transcript: settledTranscripts.get(key)! } : null),
  );
  const { delegatedTaskId, delegatedWorkspaceId, result } = item.child;
  const messages = useAppStore((state) => !enabled ? undefined
    : state.activeWorkspaceId === delegatedWorkspaceId
      ? state.messagesByTask[delegatedTaskId]
      : state.workspaceRuntimeCacheById[delegatedWorkspaceId]?.messagesByTask[delegatedTaskId]);
  const loadKey = key ?? `${delegatedTaskId}:running`;
  useEffect(() => {
    if (!enabled) return;
    if (key && messages?.length) settledTranscripts.delete(key);
    const cached = key ? settledTranscripts.get(key) : undefined;
    if (cached) {
      setLoaded({ key: loadKey, transcript: cached });
      return;
    }
    let cancelled = false;
    void readAttachedTaskMessages({
      getState: useAppStore.getState,
      attachment: { taskId: delegatedTaskId, workspaceId: delegatedWorkspaceId },
    })
      .catch(() => [])
      .then((messages) => {
        if (cancelled) return;
        const read = summarizeReviewTranscript(messages);
        const transcript = {
          prompt: read.prompt,
          reply: read.reply ?? result ?? null,
          replyId: read.reply ? read.replyId : null,
        };
        // The ledger's copy is cut short; only the task's own reply is final.
        if (key && read.reply && !messages.some((message) => message.role === "assistant" && message.isStreaming)) {
          if (settledTranscripts.size >= MAX_CACHED) {
            const oldest = settledTranscripts.keys().next().value;
            if (oldest !== undefined) settledTranscripts.delete(oldest);
          }
          settledTranscripts.set(key, transcript);
        }
        setLoaded({ key: loadKey, transcript });
      });
    return () => {
      cancelled = true;
    };
  }, [delegatedTaskId, delegatedWorkspaceId, enabled, key, loadKey, messages, result]);
  const transcript = loaded?.key === loadKey ? loaded.transcript : null;
  const findings = useMemo(() => {
    if (item.status !== "ready" || !transcript) return null;
    const parsed = parseReviewFindingsForPrompt(transcript.reply, transcript.prompt);
    // A review started before findings existed never promised a block, so
    // its reply is not "unreadable", it simply has no findings list.
    if (!parsed.ok && !transcript.prompt?.includes(REVIEW_FINDINGS_FENCE)) return null;
    return parsed;
  }, [item.status, transcript]);
  return { transcript, findings };
}
