import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { RepositoryMemoryFactInput } from "@/lib/project-memory";
import { buildDelegatedTaskReceiptsRetrievedContext } from "@/lib/task-context/delegated-task-receipts";
import {
  buildRepositoryMemoryRetrievedContextPart,
  resolveRepositoryMemoryRecallQuery,
} from "@/lib/task-context/project-memory";
import type { ChatMessage } from "@/types/chat";

/**
 * Renderer side of project memory for a UI-initiated turn.
 *
 * Lives outside `app.store` so the store stays under its max-lines ratchet;
 * the store only supplies identity (project path, task id, history, prompt).
 * Both lookups are best-effort: a missing preload API or a failed IPC yields
 * no block, never a failed turn.
 */
export async function collectTurnStartRetrievedContextParts(args: {
  repositoryPath: string | null;
  parentTaskId: string;
  history: readonly Pick<ChatMessage, "role" | "content">[];
  prompt: string;
}): Promise<CanonicalRetrievedContextPart[]> {
  const [delegatedTaskSummaries, repositoryMemoryPart] = await Promise.all([
    window.api?.runs?.listDelegatedTasks?.({
      parentTaskId: args.parentTaskId,
      includeFinished: true,
    }) ?? Promise.resolve([]),
    recallRepositoryMemoryRetrievedContext(args),
  ]);
  const parts: CanonicalRetrievedContextPart[] = [];
  if (repositoryMemoryPart) {
    parts.push(repositoryMemoryPart);
  }
  // A parent that delegated work sees where its children stand before its
  // next turn — identity, phase and reason only, never a child's transcript.
  const delegatedTaskReceiptsPart = buildDelegatedTaskReceiptsRetrievedContext({
    children: delegatedTaskSummaries,
  });
  if (delegatedTaskReceiptsPart) {
    parts.push(delegatedTaskReceiptsPart);
  }
  return parts;
}

export async function recallRepositoryMemoryRetrievedContext(args: {
  repositoryPath: string | null;
  history: readonly Pick<ChatMessage, "role" | "content">[];
  prompt: string;
}): Promise<CanonicalRetrievedContextPart | null> {
  const repositoryPath = args.repositoryPath?.trim();
  const recall = window.api?.repositoryMemory?.recall;
  if (!repositoryPath || !recall) {
    return null;
  }
  try {
    const result = await recall({
      repositoryPath,
      query: resolveRepositoryMemoryRecallQuery({
        history: args.history,
        prompt: args.prompt,
      }),
    });
    if (!result.ok) {
      return null;
    }
    return buildRepositoryMemoryRetrievedContextPart({ memories: result.items });
  } catch {
    return null;
  }
}

/**
 * Store the facts the turn-summary model surfaced, at auto-extraction
 * confidence. Fire-and-forget: the summary itself has already been applied.
 */
export function rememberTurnDurableFacts(args: {
  repositoryPath: string | null;
  taskId: string;
  turnId: string;
  facts: RepositoryMemoryFactInput[];
  collectionRevision?: number;
}) {
  const repositoryPath = args.repositoryPath?.trim();
  const remember = window.api?.repositoryMemory?.remember;
  if (!repositoryPath || !remember || args.facts.length === 0) {
    return;
  }
  void remember({
    repositoryPath,
    facts: args.facts,
    source: "auto",
    sourceTaskId: args.taskId,
    sourceTurnId: args.turnId,
    ...(args.collectionRevision !== undefined ? { collectionRevision: args.collectionRevision } : {}),
  }).catch(() => undefined);
}
