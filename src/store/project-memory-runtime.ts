import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { ProjectMemoryFactInput } from "@/lib/project-memory";
import { buildChildTaskReceiptsRetrievedContext } from "@/lib/task-context/child-task-receipts";
import {
  buildProjectMemoryRetrievedContextPart,
  resolveProjectMemoryRecallQuery,
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
  projectPath: string | null;
  parentTaskId: string;
  history: readonly Pick<ChatMessage, "role" | "content">[];
  prompt: string;
}): Promise<CanonicalRetrievedContextPart[]> {
  const [childTaskSummaries, projectMemoryPart] = await Promise.all([
    window.api?.runs?.listChildTasks?.({
      parentTaskId: args.parentTaskId,
      includeFinished: true,
    }) ?? Promise.resolve([]),
    recallProjectMemoryRetrievedContext(args),
  ]);
  const parts: CanonicalRetrievedContextPart[] = [];
  if (projectMemoryPart) {
    parts.push(projectMemoryPart);
  }
  // A parent that delegated work sees where its children stand before its
  // next turn — identity, phase and reason only, never a child's transcript.
  const childTaskReceiptsPart = buildChildTaskReceiptsRetrievedContext({
    children: childTaskSummaries,
  });
  if (childTaskReceiptsPart) {
    parts.push(childTaskReceiptsPart);
  }
  return parts;
}

export async function recallProjectMemoryRetrievedContext(args: {
  projectPath: string | null;
  history: readonly Pick<ChatMessage, "role" | "content">[];
  prompt: string;
}): Promise<CanonicalRetrievedContextPart | null> {
  const projectPath = args.projectPath?.trim();
  const recall = window.api?.projectMemory?.recall;
  if (!projectPath || !recall) {
    return null;
  }
  try {
    const result = await recall({
      projectPath,
      query: resolveProjectMemoryRecallQuery({
        history: args.history,
        prompt: args.prompt,
      }),
    });
    if (!result.ok) {
      return null;
    }
    return buildProjectMemoryRetrievedContextPart({ memories: result.items });
  } catch {
    return null;
  }
}

/**
 * Store the facts the turn-summary model surfaced, at auto-extraction
 * confidence. Fire-and-forget: the summary itself has already been applied.
 */
export function rememberTurnDurableFacts(args: {
  projectPath: string | null;
  taskId: string;
  turnId: string;
  facts: ProjectMemoryFactInput[];
}) {
  const projectPath = args.projectPath?.trim();
  const remember = window.api?.projectMemory?.remember;
  if (!projectPath || !remember || args.facts.length === 0) {
    return;
  }
  void remember({
    projectPath,
    facts: args.facts,
    source: "auto",
    sourceTaskId: args.taskId,
    sourceTurnId: args.turnId,
  }).catch(() => undefined);
}
