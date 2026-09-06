import { isConversationCompactCommand } from "../../src/lib/providers/native-compaction";
import {
  toCodexUserFacingErrorMessage,
  toErrorMessage,
} from "./codex-app-server-errors";
import { resolveGitHeadRef } from "./git-head-ref";
import type { BridgeEvent } from "./types";
import { normalizeCodexContextUsage } from "./codex-token-usage";

type Notification = { id?: string | number; method?: string; params?: unknown };
type CompactionClient = {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
  subscribe(listener: (message: Notification) => void): () => void;
  onProcessExit(listener: (message: string) => void): () => void;
};
const activeCompactions = new WeakMap<CompactionClient, Set<string>>();

export const isCodexCompactSlashCommand = isConversationCompactCommand;

export function buildCodexCompactionCompletedEvent(
  trigger: "manual" | "auto",
  cwd?: string,
): BridgeEvent {
  const gitRef = cwd ? resolveGitHeadRef({ cwd }) : undefined;
  return {
    type: "system",
    content: `Context compacted (${trigger}).`,
    compactBoundary: { trigger, ...(gitRef ? { gitRef } : {}) },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** RPC acknowledgement is only acceptance; retain the turn until native completion. */
export async function runCodexCompactSlashCommand(args: {
  client: CompactionClient;
  threadId: string;
  input: string;
  cwd?: string;
  registerAbort?: (abort: () => void) => void;
  onProgress?: (event: BridgeEvent) => void;
  timeoutMs?: number;
  interruptGraceMs?: number;
}): Promise<BridgeEvent[] | null> {
  if (!isCodexCompactSlashCommand(args.input)) return null;
  const failure = (message: string): BridgeEvent[] => [
    {
      type: "error",
      message: toCodexUserFacingErrorMessage({ message }),
      recoverable: true,
    },
    { type: "done", stop_reason: "runtime_failure" },
  ];
  if (args.input.trim().toLowerCase() !== "/compact") {
    return failure(
      "Codex compaction does not accept custom instructions. Use /compact without arguments.",
    );
  }
  const active = activeCompactions.get(args.client) ?? new Set<string>();
  if (active.has(args.threadId))
    return failure(
      "Context compaction is already in progress for this provider session.",
    );
  active.add(args.threadId);
  activeCompactions.set(args.client, active);

  let turnId: string | undefined;
  let compacted = false;
  let aborted = false;
  let settled = false;
  let nativeError: string | undefined;
  let interruptTimer: ReturnType<typeof setTimeout> | undefined;
  let finish!: (events: BridgeEvent[]) => void;
  const completion = new Promise<BridgeEvent[]>((resolve) => {
    finish = (events) => {
      if (settled) return;
      settled = true;
      resolve(events);
    };
  });
  const cancelled = (): BridgeEvent[] => [
    { type: "done", stop_reason: "user_abort" },
  ];
  const interrupt = () => {
    if (turnId) {
      void args.client
        .request("turn/interrupt", { threadId: args.threadId, turnId })
        .catch(() => {});
    }
  };
  const unsubscribe = args.client.subscribe((message) => {
    if (settled || message.id !== undefined) return;
    const params = record(message.params);
    if (params.threadId !== args.threadId) return;
    if (message.method === "thread/tokenUsage/updated") {
      const usage = normalizeCodexContextUsage(params.tokenUsage);
      if (usage) args.onProgress?.(usage);
      return;
    }
    const turn = record(params.turn);
    const incomingTurnId =
      typeof params.turnId === "string"
        ? params.turnId
        : typeof turn.id === "string"
          ? turn.id
          : undefined;
    if (turnId && incomingTurnId && turnId !== incomingTurnId) return;
    if (!turnId && incomingTurnId) {
      turnId = incomingTurnId;
      if (aborted) interrupt();
    }
    const item = record(params.item);
    if (
      (message.method === "item/completed" &&
        item.type === "contextCompaction") ||
      message.method === "thread/compacted"
    ) {
      compacted = true;
    }
    if (message.method === "error" && params.willRetry !== true) {
      const error = record(params.error);
      nativeError = String(error.message ?? "Codex context compaction failed.");
    }
    if (message.method !== "turn/completed") return;
    if (aborted || turn.status === "interrupted") {
      finish(cancelled());
    } else if (nativeError || turn.status !== "completed" || !compacted) {
      finish(
        failure(
          nativeError ??
            String(
              record(turn.error).message ??
                "Codex did not confirm completed context compaction.",
            ),
        ),
      );
    } else {
      finish([
        buildCodexCompactionCompletedEvent("manual", args.cwd),
        { type: "done" },
      ]);
    }
  });
  const unsubscribeExit = args.client.onProcessExit((message) => {
    finish(aborted ? cancelled() : failure(message));
  });
  const timeout = setTimeout(
    () => {
      interrupt();
      finish(
        failure(
          "Codex did not confirm context compaction before the timeout. The provider may still be stopping; wait before retrying.",
        ),
      );
    },
    args.timeoutMs ?? 10 * 60_000,
  );
  args.registerAbort?.(() => {
    if (settled || aborted) return;
    aborted = true;
    interrupt();
    interruptTimer = setTimeout(
      () => finish(cancelled()),
      args.interruptGraceMs ?? 10_000,
    );
  });
  try {
    if (aborted) return cancelled();
    args.onProgress?.({
      type: "system",
      content: "Compacting conversation context…",
    });
    // Subscribe before requesting: notifications can arrive before the RPC response.
    void args.client
      .request("thread/compact/start", { threadId: args.threadId })
      .catch((error) =>
        finish(aborted ? cancelled() : failure(toErrorMessage(error))),
      );
    return await completion;
  } finally {
    settled = true;
    clearTimeout(timeout);
    clearTimeout(interruptTimer);
    unsubscribe();
    unsubscribeExit();
    active.delete(args.threadId);
  }
}

export async function compactCodexThreadWithClient(
  client: CompactionClient,
  threadId: string,
) {
  const events = await runCodexCompactSlashCommand({
    client,
    threadId,
    input: "/compact",
  });
  const error = events?.find((event) => event.type === "error");
  const completed = events?.some(
    (event) =>
      event.type === "system" && event.compactBoundary?.trigger === "manual",
  );
  return {
    ok: Boolean(completed),
    detail:
      error?.message ??
      (completed
        ? "Compacted Codex thread context."
        : "Codex context compaction was interrupted."),
  };
}
