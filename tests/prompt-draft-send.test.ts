import { describe, expect, test } from "bun:test";
import {
  applySteeredPromptDraft,
  buildPreservedQueuedDraft,
  buildPromptDraftForSend,
  resolvePromptDraftAfterSend,
  resolvePromptDraftSendState,
} from "@/store/prompt-draft-send";
import type { PromptDraft } from "@/types/chat";

const SOURCE_DRAFT: PromptDraft = {
  text: "Keep this composer draft",
  attachedFilePaths: ["src/keep.ts"],
  attachments: [{ kind: "file", filePath: "src/keep.ts" }],
  runtimeOverrides: { model: "gpt-5.4" },
};

describe("prompt draft send state", () => {
  test("builds an isolated review payload without copying the composer", () => {
    expect(
      buildPromptDraftForSend({
        content: "Review local changes",
        preservePromptDraft: true,
        runtimeOverrides: { model: "claude-opus-4-6" },
        sourceDraft: SOURCE_DRAFT,
        storedDraft: SOURCE_DRAFT,
      }),
    ).toEqual({
      text: "Review local changes",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { model: "claude-opus-4-6" },
      promptBatch: undefined,
      queuedTurns: undefined,
      queuedNextTurn: undefined,
    });
    expect(SOURCE_DRAFT.text).toBe("Keep this composer draft");
  });

  test("uses a queued turn as the payload and keeps the remaining queue", () => {
    const queuedTurn = {
      id: "queued-1",
      queuedAt: "2026-07-22T00:00:00.000Z",
      sourceTurnId: "turn-1",
      content: "Queued review",
      attachedFilePaths: ["src/queued.ts"],
      attachments: [{ kind: "file" as const, filePath: "src/queued.ts" }],
    };
    const remainingTurn = { ...queuedTurn, id: "queued-2" };

    expect(
      buildPromptDraftForSend({
        content: "Ignored composer text",
        sourceDraft: SOURCE_DRAFT,
        storedDraft: { ...SOURCE_DRAFT, queuedTurns: [queuedTurn] },
        queuedTurn,
        remainingQueuedTurns: [remainingTurn],
      }),
    ).toMatchObject({
      text: "Queued review",
      attachedFilePaths: ["src/queued.ts"],
      queuedTurns: [remainingTurn],
    });
  });

  test("blocks a queued send when the requested item no longer exists", () => {
    expect(
      resolvePromptDraftSendState({
        content: "Missing queue item",
        sourceDraft: SOURCE_DRAFT,
        storedDraft: SOURCE_DRAFT,
        queuedTurnId: "missing",
      }),
    ).toBeNull();
  });

  test("removes a dispatched item while preserving follow-up queue entries", () => {
    const queuedTurn = {
      id: "queued-1",
      queuedAt: "2026-07-22T00:00:00.000Z",
      sourceTurnId: "turn-1",
      content: "Queued review",
      attachedFilePaths: [],
      attachments: [],
    };

    expect(
      buildPreservedQueuedDraft({
        sourceDraft: SOURCE_DRAFT,
        queuedTurn,
        queuedTurns: [{ ...queuedTurn, id: "goal-1" }],
        remainingQueuedTurns: [{ ...queuedTurn, id: "queued-2" }],
      })?.queuedTurns?.map((item) => item.id),
    ).toEqual(["goal-1", "queued-2"]);
  });

  test("preserves the current composer after an isolated send", () => {
    const latestDraft = { ...SOURCE_DRAFT, text: "Latest composer text" };

    expect(
      resolvePromptDraftAfterSend({
        currentDraft: latestDraft,
        storedDraft: SOURCE_DRAFT,
        sourceDraft: SOURCE_DRAFT,
        sentDraft: { ...SOURCE_DRAFT, text: "Review local changes" },
        preservePromptDraft: true,
      }),
    ).toBe(latestDraft);
  });

  test("clears a normal sent draft while keeping generated queued turns", () => {
    const queuedTurns = [
      {
        id: "goal-1",
        queuedAt: "2026-07-22T00:00:00.000Z",
        sourceTurnId: "turn-1",
        content: "Continue the goal",
        attachedFilePaths: [],
        attachments: [],
      },
    ];

    expect(
      resolvePromptDraftAfterSend({
        sourceDraft: SOURCE_DRAFT,
        sentDraft: SOURCE_DRAFT,
        queuedTurns,
      }),
    ).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { model: "gpt-5.4" },
      queuedTurns,
    });
  });
  test("drops only the steered queue item and leaves the composer alone", () => {
    const queuedTurn = {
      id: "queued-1",
      queuedAt: "2026-07-22T00:00:00.000Z",
      sourceTurnId: "turn-1",
      content: "Steer me into the live turn",
      attachedFilePaths: [],
      attachments: [],
    };
    const followUp = { ...queuedTurn, id: "queued-2", content: "Then this" };
    const storedDraft = {
      ...SOURCE_DRAFT,
      queuedTurns: [queuedTurn, followUp],
    };

    const next = applySteeredPromptDraft({
      promptDraftByTask: { "task-1": storedDraft },
      taskId: "task-1",
      storedDraft,
      sourceDraft: SOURCE_DRAFT,
      sentDraft: { ...SOURCE_DRAFT, text: queuedTurn.content },
      steeredQueuedTurn: queuedTurn,
    });

    expect(next["task-1"]?.text).toBe("Keep this composer draft");
    expect(next["task-1"]?.queuedTurns?.map((item) => item.id)).toEqual([
      "queued-2",
    ]);
  });

  test("clears the composer after steering its own text, but not a newer draft", () => {
    const sentDraft = { ...SOURCE_DRAFT, text: "Steered text" };

    expect(
      applySteeredPromptDraft({
        promptDraftByTask: { "task-1": sentDraft },
        taskId: "task-1",
        sourceDraft: SOURCE_DRAFT,
        sentDraft,
      })["task-1"],
    ).toMatchObject({ text: "", attachedFilePaths: [], attachments: [] });

    const newerDraft = { ...SOURCE_DRAFT, text: "Typed while in flight" };
    const promptDraftByTask = { "task-1": newerDraft };
    expect(
      applySteeredPromptDraft({
        promptDraftByTask,
        taskId: "task-1",
        sourceDraft: SOURCE_DRAFT,
        sentDraft,
      }),
    ).toBe(promptDraftByTask);
  });
});
