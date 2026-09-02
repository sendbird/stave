import { createHash } from "node:crypto";
import type {
  CanonicalConversationRequest,
  CanonicalRetrievedContextPart,
} from "../../src/lib/providers/provider.types";
import { getProviderNativeSlashCommandInput } from "../../src/lib/providers/provider-request-translators";
import {
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
} from "../../src/lib/task-context/current-task-awareness";

/**
 * Retrieved-context sources that are rebuilt from live state every turn and are
 * therefore re-sent verbatim even when nothing about them changed. Unlike the
 * first-turn-only blocks, these *can* change, so they cannot simply be dropped
 * on a primed session — they are compared instead.
 */
export const DEDUPABLE_RETRIEVED_CONTEXT_SOURCE_IDS = [
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
] as const;

/**
 * Bound on the number of `${taskId}:${sessionId}:${sourceId}` entries kept.
 * Each entry is a short hex digest, so the ceiling exists to stop unbounded
 * growth across a long-running app session, not to save meaningful memory.
 */
export const RETRIEVED_CONTEXT_DEDUP_MAX_ENTRIES = 2000;

export function buildRetrievedContextUnchangedNotice(title: string | undefined) {
  return `${title ?? "This context block"} is unchanged since the previous turn in this session. Reuse the copy already in the transcript.`;
}

/**
 * In-memory only. A restart re-sends each block once per task, which is the
 * correct failure direction: the provider session is gone too, so the agent
 * genuinely needs the content again.
 */
export class RetrievedContextDedupStore {
  private readonly hashes = new Map<string, string>();

  constructor(
    private readonly maxEntries = RETRIEVED_CONTEXT_DEDUP_MAX_ENTRIES,
  ) {}

  get(key: string) {
    const value = this.hashes.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Refresh recency so an actively used task never gets evicted by idle ones.
    this.hashes.delete(key);
    this.hashes.set(key, value);
    return value;
  }

  set(key: string, value: string) {
    this.hashes.delete(key);
    this.hashes.set(key, value);
    while (this.hashes.size > this.maxEntries) {
      const oldest = this.hashes.keys().next();
      if (oldest.done) {
        break;
      }
      this.hashes.delete(oldest.value);
    }
  }

  clearTask(taskId: string) {
    const prefix = `${taskId}:`;
    for (const key of [...this.hashes.keys()]) {
      if (key.startsWith(prefix)) {
        this.hashes.delete(key);
      }
    }
  }

  get size() {
    return this.hashes.size;
  }
}

const sharedStore = new RetrievedContextDedupStore();

function hashContent(content: string) {
  return createHash("sha1").update(content).digest("hex");
}

/**
 * Replace retrieved-context blocks whose content is byte-identical to what this
 * provider session already received with a one-line pointer.
 *
 * The replacement is only ever applied when there is an active resume session
 * id — on a fresh session the transcript the pointer refers to does not exist.
 * The recorded hashes are staged and only written by `commit()`, which the
 * caller invokes after the prompt was actually handed to the provider; a turn
 * that fails before dispatch must not convince the next turn that the content
 * was delivered.
 */
export function dedupeRetrievedContextForSession(args: {
  conversation?: CanonicalConversationRequest;
  activeResumeSessionId?: string | null;
  taskId?: string | null;
  store?: RetrievedContextDedupStore;
  dedupSourceIds?: readonly string[];
}): {
  conversation?: CanonicalConversationRequest;
  commit: () => void;
  replacedSourceIds: string[];
} {
  const noop = {
    conversation: args.conversation,
    commit: () => {},
    replacedSourceIds: [] as string[],
  };
  const sessionId = args.activeResumeSessionId?.trim();
  const taskId = args.taskId?.trim() || args.conversation?.taskId?.trim();
  if (!args.conversation || !sessionId || !taskId) {
    return noop;
  }
  // A provider-native slash command is sent verbatim: the prompt builder drops
  // every context part. Recording hashes for content that was never sent would
  // make the *next* turn replace a genuinely changed block with a pointer to a
  // copy the transcript does not contain.
  if (getProviderNativeSlashCommandInput(args.conversation)) {
    return noop;
  }

  const store = args.store ?? sharedStore;
  const dedupSourceIds = new Set(
    args.dedupSourceIds ?? DEDUPABLE_RETRIEVED_CONTEXT_SOURCE_IDS,
  );
  const staged: Array<[string, string]> = [];
  const replacedSourceIds: string[] = [];

  const nextContextParts = args.conversation.contextParts.map((part) => {
    if (part.type !== "retrieved_context" || !dedupSourceIds.has(part.sourceId)) {
      return part;
    }
    const key = `${taskId}:${sessionId}:${part.sourceId}`;
    const hash = hashContent(part.content);
    staged.push([key, hash]);
    if (store.get(key) !== hash) {
      return part;
    }
    replacedSourceIds.push(part.sourceId);
    return {
      ...part,
      content: buildRetrievedContextUnchangedNotice(part.title),
    } satisfies CanonicalRetrievedContextPart;
  });

  return {
    conversation:
      replacedSourceIds.length === 0
        ? args.conversation
        : { ...args.conversation, contextParts: nextContextParts },
    commit: () => {
      for (const [key, hash] of staged) {
        store.set(key, hash);
      }
    },
    replacedSourceIds,
  };
}
