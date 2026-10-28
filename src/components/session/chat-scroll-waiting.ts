import { i18n } from "@/i18n/runtime";
import { resolveVisibleQueuedTurns } from "@/components/session/composer-shelf/composer-shelf.utils";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import type { ChatMessage, PromptDraft } from "@/types/chat";

/**
 * What the scroll-to-bottom button names while the reader is scrolled up.
 * Only the most urgent reason is named; queued messages are counted beside it.
 */
export type ScrollWaitingReason = "approval" | "question" | "newResponse";

export interface ScrollWaitingSummary {
  reason: ScrollWaitingReason | null;
  queuedCount: number;
}

/** The transcript facts the "new response" signal compares. */
export interface ScrollResponseSnapshot {
  lastAssistantMessageId: string | null;
  turnActive: boolean;
}

/**
 * Whether a response arrived after the reader left the bottom: a new
 * assistant message landed, or the turn that was running then has finished.
 */
export function hasUnseenResponse(args: {
  baseline: ScrollResponseSnapshot;
  current: ScrollResponseSnapshot;
}): boolean {
  const { baseline, current } = args;
  if (
    current.lastAssistantMessageId !== null &&
    current.lastAssistantMessageId !== baseline.lastAssistantMessageId
  ) {
    return true;
  }
  return baseline.turnActive && !current.turnActive;
}

/** `null` while nothing waits below, so the button stays icon-only. */
export function deriveScrollWaitingSummary(args: {
  hasPendingApproval: boolean;
  hasPendingQuestion: boolean;
  hasUnseenResponse: boolean;
  queuedCount: number;
}): ScrollWaitingSummary | null {
  const reason: ScrollWaitingReason | null = args.hasPendingApproval
    ? "approval"
    : args.hasPendingQuestion
      ? "question"
      : args.hasUnseenResponse
        ? "newResponse"
        : null;
  const queuedCount = Math.max(0, Math.floor(args.queuedCount));
  if (reason === null && queuedCount === 0) {
    return null;
  }
  return { reason, queuedCount };
}

const REASON_KEYS = {
  approval: "composer:conversation.waitingApproval",
  question: "composer:conversation.waitingQuestion",
  newResponse: "composer:conversation.waitingNewResponse",
} as const;

/** The visible pill text, such as "Needs approval · 2 queued". */
export function formatScrollWaitingLabel(summary: ScrollWaitingSummary): string {
  const reason = summary.reason ? i18n.t(REASON_KEYS[summary.reason]) : null;
  const queued =
    summary.queuedCount > 0
      ? i18n.t("composer:conversation.waitingQueued", {
          count: summary.queuedCount,
        })
      : null;
  if (reason && queued) {
    return i18n.t("composer:conversation.waitingWithQueued", {
      reason,
      queued,
    });
  }
  return reason ?? queued ?? "";
}

/** The button's accessible name: the visible text first, then what it does. */
export function formatScrollWaitingAriaLabel(label: string): string {
  return i18n.t("composer:conversation.waitingAriaLabel", { label });
}

/* ─── Store reads ──────────────────────────────────────────────── */

interface PendingFlags {
  approval: boolean;
  question: boolean;
}

// Store selectors run on every store update; the scan is redone only when the
// task's message list itself changes.
const pendingFlagsByMessages = new WeakMap<readonly ChatMessage[], PendingFlags>();

function readPendingFlags(messages: readonly ChatMessage[]): PendingFlags {
  const cached = pendingFlagsByMessages.get(messages);
  if (cached) {
    return cached;
  }
  const list = messages as ChatMessage[];
  const flags = {
    approval: findLatestPendingApproval({ messages: list }) !== null,
    question: findLatestPendingUserInput({ messages: list }) !== null,
  };
  pendingFlagsByMessages.set(messages, flags);
  return flags;
}

export function selectHasPendingApproval(
  messages: readonly ChatMessage[] | undefined,
): boolean {
  return messages ? readPendingFlags(messages).approval : false;
}

export function selectHasPendingQuestion(
  messages: readonly ChatMessage[] | undefined,
): boolean {
  return messages ? readPendingFlags(messages).question : false;
}

export function selectLastAssistantMessageId(
  messages: readonly ChatMessage[] | undefined,
): string | null {
  if (!messages) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message.id;
    }
  }
  return null;
}

export function selectQueuedTurnCount(draft: PromptDraft | undefined): number {
  if (!draft) {
    return 0;
  }
  return resolveVisibleQueuedTurns({
    queuedTurns: draft.queuedTurns ?? [],
    queuedNextTurn: draft.queuedNextTurn ?? null,
  }).length;
}
