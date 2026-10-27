import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  deriveScrollWaitingSummary,
  formatScrollWaitingAriaLabel,
  formatScrollWaitingLabel,
  hasUnseenResponse,
  selectHasPendingApproval,
  selectHasPendingQuestion,
  selectLastAssistantMessageId,
  selectQueuedTurnCount,
} from "@/components/session/chat-scroll-waiting";
import type { ChatMessage, PromptDraft } from "@/types/chat";

afterEach(() => applyAppLocale("en"));

const NOTHING = {
  hasPendingApproval: false,
  hasPendingQuestion: false,
  hasUnseenResponse: false,
  queuedCount: 0,
};

describe("scroll-to-bottom waiting summary", () => {
  test("stays icon-only while nothing waits below", () => {
    expect(deriveScrollWaitingSummary(NOTHING)).toBeNull();
  });

  test("names only the most urgent reason", () => {
    expect(
      deriveScrollWaitingSummary({
        hasPendingApproval: true,
        hasPendingQuestion: true,
        hasUnseenResponse: true,
        queuedCount: 0,
      }),
    ).toEqual({ reason: "approval", queuedCount: 0 });
    expect(
      deriveScrollWaitingSummary({
        ...NOTHING,
        hasPendingQuestion: true,
        hasUnseenResponse: true,
      }),
    ).toEqual({ reason: "question", queuedCount: 0 });
    expect(
      deriveScrollWaitingSummary({ ...NOTHING, hasUnseenResponse: true }),
    ).toEqual({ reason: "newResponse", queuedCount: 0 });
  });

  test("counts queued messages with or without a reason", () => {
    expect(deriveScrollWaitingSummary({ ...NOTHING, queuedCount: 2 })).toEqual({
      reason: null,
      queuedCount: 2,
    });
    expect(
      deriveScrollWaitingSummary({
        ...NOTHING,
        hasPendingApproval: true,
        queuedCount: 2,
      }),
    ).toEqual({ reason: "approval", queuedCount: 2 });
  });

  test("labels read as one phrase in English and Korean, and the name starts with them", () => {
    const label = formatScrollWaitingLabel({ reason: "approval", queuedCount: 2 });
    expect(label).toBe("Needs approval · 2 queued");
    expect(formatScrollWaitingAriaLabel(label)).toBe(
      "Needs approval · 2 queued, scroll to bottom",
    );
    expect(formatScrollWaitingLabel({ reason: null, queuedCount: 1 })).toBe("1 queued");
    expect(formatScrollWaitingLabel({ reason: "question", queuedCount: 0 })).toBe(
      "Needs your answer",
    );
    expect(formatScrollWaitingLabel({ reason: "newResponse", queuedCount: 0 })).toBe(
      "New response",
    );

    applyAppLocale("ko");
    const korean = formatScrollWaitingLabel({ reason: "approval", queuedCount: 2 });
    expect(korean).toBe("승인 필요 · 대기열 2개");
    expect(formatScrollWaitingAriaLabel(korean).startsWith(korean)).toBe(true);
  });
});

describe("unseen response", () => {
  const baseline = { lastAssistantMessageId: "a1", turnActive: true };

  test("nothing new while the reader is away", () => {
    expect(hasUnseenResponse({ baseline, current: baseline })).toBe(false);
  });

  test("a new assistant message counts", () => {
    expect(
      hasUnseenResponse({
        baseline,
        current: { lastAssistantMessageId: "a2", turnActive: true },
      }),
    ).toBe(true);
  });

  test("the running turn finishing counts", () => {
    expect(
      hasUnseenResponse({
        baseline,
        current: { lastAssistantMessageId: "a1", turnActive: false },
      }),
    ).toBe(true);
  });

  test("an idle task that stays idle does not", () => {
    const idle = { lastAssistantMessageId: "a1", turnActive: false };
    expect(hasUnseenResponse({ baseline: idle, current: idle })).toBe(false);
    // A turn that starts after the reader left is not a response yet.
    expect(
      hasUnseenResponse({
        baseline: idle,
        current: { lastAssistantMessageId: "a1", turnActive: true },
      }),
    ).toBe(false);
  });
});

describe("store reads", () => {
  const message = (
    id: string,
    role: ChatMessage["role"],
    parts: ChatMessage["parts"] = [],
  ): ChatMessage =>
    ({ id, role, content: "", parts, providerId: "claude-code", model: "m" }) as ChatMessage;

  test("find pending approvals, questions and the last assistant message", () => {
    const messages = [
      message("u1", "user"),
      message("a1", "assistant", [
        {
          type: "approval",
          toolName: "Bash",
          description: "",
          requestId: "r1",
          state: "approval-requested",
        },
      ] as ChatMessage["parts"]),
      message("u2", "user"),
    ];
    expect(selectHasPendingApproval(messages)).toBe(true);
    expect(selectHasPendingQuestion(messages)).toBe(false);
    expect(selectLastAssistantMessageId(messages)).toBe("a1");
    // Repeated reads of the same list return the same answer from the cache.
    expect(selectHasPendingApproval(messages)).toBe(true);
    expect(selectHasPendingApproval(undefined)).toBe(false);
    expect(selectLastAssistantMessageId([])).toBeNull();
  });

  test("count queued messages, including a single legacy queued turn", () => {
    expect(selectQueuedTurnCount(undefined)).toBe(0);
    expect(
      selectQueuedTurnCount({
        text: "",
        queuedTurns: [
          { id: "q1", queuedAt: "t", content: "a", attachedFilePaths: [], attachments: [] },
          { id: "q2", queuedAt: "t", content: "b", attachedFilePaths: [], attachments: [] },
        ],
      } as unknown as PromptDraft),
    ).toBe(2);
    expect(
      selectQueuedTurnCount({
        text: "",
        queuedNextTurn: { queuedAt: "t", content: "later" },
      } as unknown as PromptDraft),
    ).toBe(1);
  });
});
