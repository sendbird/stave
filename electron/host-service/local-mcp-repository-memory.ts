import type { ChatMessage } from "../../src/types/chat";
import type { CanonicalRetrievedContextPart } from "../../src/lib/providers/provider.types";
import type { RepositoryMemory } from "../../src/lib/repository-memory";
import {
  buildRepositoryMemoryRetrievedContextPart,
  resolveRepositoryMemoryRecallQuery,
} from "../../src/lib/task-context/repository-memory";
import { ensureHostServicePersistenceReady } from "./persistence";

/**
 * The `stave:repository-memory` block for a host-initiated turn. Memory is a
 * best-effort aid: a store without the method (test doubles) or a failing
 * query yields no block rather than a failed turn.
 */
export function buildRepositoryMemoryPartForTurn(args: {
  repositoryPath: string;
  history: ChatMessage[];
  prompt: string;
}): CanonicalRetrievedContextPart | null {
  try {
    const store = ensureHostServicePersistenceReady() as {
      recallRepositoryMemories?: (input: {
        repositoryPath: string;
        query?: string | null;
      }) => RepositoryMemory[];
    };
    if (typeof store.recallRepositoryMemories !== "function") {
      return null;
    }
    const memories = store.recallRepositoryMemories({
      repositoryPath: args.repositoryPath,
      query: resolveRepositoryMemoryRecallQuery({
        history: args.history,
        prompt: args.prompt,
      }),
    });
    return buildRepositoryMemoryRetrievedContextPart({ memories });
  } catch (error) {
    console.warn("[stave-mcp] project memory recall failed", error);
    return null;
  }
}
