import type { TurnDigest } from "@/lib/providers/turn-digest";
import type {
  ListTaskTurnHistoryArgs,
  ReadTaskTurnRecordArgs,
  TurnHistoryEntry,
  TurnRecord,
  TurnRecordMessage,
} from "@/lib/providers/turn-history";
import type { ChatMessage } from "@/types/chat";

/**
 * Saved turns for the Task panel preview, served the way the desktop bridge
 * would: a failed turn with a full record and a turn from before records
 * existed ("No record").
 */
const FAILED_DIGEST: TurnDigest = {
  version: 1,
  omitted: 2,
  accountProfileId: "work-account",
  entries: [
    { kind: "account", at: "2026-09-29T08:50:00.000Z", providerId: "claude-code", fromAccountId: "system-default", toAccountId: "work-account", since: "previous-turn" },
    { kind: "route", at: "2026-09-29T08:50:04.000Z", fromModel: "claude-opus-5", toModel: "claude-sonnet-5", reason: "Claude reported a provider error and switched models." },
    { kind: "retry", at: "2026-09-29T08:52:10.000Z", message: "Overloaded: the API is temporarily over capacity.", count: 3, lastAt: "2026-09-29T08:53:00.000Z" },
    { kind: "stall", at: "2026-09-29T08:55:00.000Z", silentMs: 412_000, endedTurn: false },
    { kind: "error", at: "2026-09-29T09:02:58.000Z", message: "Stream closed before the turn finished.", count: 1 },
    {
      kind: "checks",
      at: "2026-09-29T09:03:30.000Z",
      status: "fail",
      executed: 3,
      total: 3,
      failures: [
        { scriptId: "test", message: "2 tests failed in tests/settings-sidebar.test.tsx", blocking: true },
        { scriptId: "lint", message: "1 warning", blocking: false },
      ],
      omittedFailures: 0,
    },
  ],
};

export function previewTurnHistory(taskId: string, plainTaskId: string): TurnHistoryEntry[] {
  if (taskId !== plainTaskId) return [];
  return [
    {
      id: "turn-plain-1",
      providerId: "claude-code",
      createdAt: "2026-09-29T08:50:00.000Z",
      completedAt: "2026-09-29T09:03:00.000Z",
      outcome: "failed",
      error: "Stream closed before the turn finished.",
      digest: { entryCount: FAILED_DIGEST.entries.length, hasError: true, checks: "fail" },
    },
    {
      id: "turn-plain-0",
      providerId: "claude-code",
      createdAt: "2026-09-29T08:30:00.000Z",
      completedAt: "2026-09-29T08:40:00.000Z",
      outcome: "completed",
      error: null,
      digest: null,
    },
  ];
}

function toRecordMessages(messages: readonly ChatMessage[], turnId: string): TurnRecordMessage[] {
  return messages
    .filter((message) => message.role === "assistant" && message.turnId === turnId)
    .map((message) => ({ id: message.id, role: message.role, turnId, parts: message.parts }));
}

/** Install the two turn-history reads unless a real bridge provides them. */
export function stubTurnHistory(args: { plainTaskId: string; messages: readonly ChatMessage[] }) {
  const host = window as unknown as {
    api?: Record<string, unknown> & { persistence?: Record<string, unknown> };
  };
  if (host.api?.persistence?.listTaskTurnHistory) return;
  host.api = {
    ...host.api,
    persistence: {
      ...host.api?.persistence,
      listTaskTurnHistory: async (request: ListTaskTurnHistoryArgs) => ({
        ok: true,
        page: { turns: previewTurnHistory(request.taskId, args.plainTaskId), hasMore: false },
      }),
      readTaskTurnRecord: async (request: ReadTaskTurnRecordArgs) => {
        const turn = previewTurnHistory(request.taskId, args.plainTaskId).find((entry) => entry.id === request.turnId);
        const record: TurnRecord | null = turn
          ? {
              turn,
              digest: turn.id === "turn-plain-1" ? FAILED_DIGEST : null,
              prompt: turn.id === "turn-plain-1"
                ? "Tighten the spacing of the settings sidebar and keep the keyboard order."
                : "Look at the settings sidebar spacing and propose a change.",
              messages: toRecordMessages(args.messages, turn.id),
            }
          : null;
        return { ok: true, record };
      },
    },
  };
}
