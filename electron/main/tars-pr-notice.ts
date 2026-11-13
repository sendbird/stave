import { i18n } from "../../src/i18n/runtime";
import { TARS_CI_FIX_ROUNDS, TARS_PR_REVIEW_ROUNDS } from "../../src/lib/tars/pr-checks";
import { tarsFollowUpRequestId, type TarsEvent } from "../../src/lib/tars/events";
import type { TarsAskAction } from "../../src/lib/tars/conversation";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";

/** Host notices use the existing question/answer ledger and do not spend a planner turn. Caller holds its transaction. */
export function recordTarsPrNotice(conversations: TarsConversationStore, row: TarsResponsibility, event: TarsEvent, at: string): string | null {
  const review = event.kind === "prChangesRequested" || event.kind === "prReviewNotice";
  const reviewCap = event.kind === "prChangesRequested" && (row.publication?.watch?.reviewRounds ?? 0) >= TARS_PR_REVIEW_ROUNDS;
  const cap = reviewCap || event.kind === "ciFailed" && (row.publication?.watch?.fixRounds ?? 0) >= TARS_CI_FIX_ROUNDS;
  if (event.kind !== "ciPassed" && event.kind !== "ciUnavailable" && !cap && event.kind !== "prReviewNotice") return null;
  const t = i18n.getFixedT(null, "shell");
  const number = row.publication!.number!;
  const reply = review ? t(reviewCap ? "tars.prReviews.limit" : "tars.prReviews.notice", { number }) : cap ? t("tars.prChecks.limit", { number }) : event.kind === "ciPassed"
    ? t("tars.prChecks.passedNotice", { number }) : t(row.publication?.watch?.stopped === "expired" ? "tars.prChecks.expiredNotice" : row.publication?.watch?.stopped ? "tars.prChecks.unavailableNotice" : "tars.prChecks.retryNotice", { number });
  const effect = (choice: "ready" | "keepDraft" | "watch") => ({ kind: "prReview" as const, responsibilityId: row.id, headSha: row.publication!.commit!, choice });
  const ask: TarsAskAction | null = event.kind === "ciPassed" ? { kind: "ask", question: t("tars.prChecks.question", { number }), options: [
    { label: t("tars.prChecks.ready"), rationale: t("tars.prChecks.readyHint"), effect: effect("ready") },
    { label: t("tars.prChecks.keepDraft"), rationale: t("tars.prChecks.keepHint"), effect: effect("keepDraft") },
  ] } : cap ? { kind: "ask", question: t(reviewCap ? "tars.prReviews.limitQuestion" : "tars.prChecks.limitQuestion", { number, title: row.title }), options: [
    { label: t("tars.prChecks.continue"), rationale: t("tars.prChecks.continueHint"), effect: { kind: "reply" } },
    { label: t("tars.prChecks.stop"), rationale: t("tars.prChecks.stopHint"), effect: { kind: "reply" } },
  ] } : row.publication?.watch?.stopped ? { kind: "ask", question: t("tars.prChecks.watchQuestion", { number }), options: [
    { label: t("tars.prChecks.watch"), rationale: t("tars.prChecks.watchHint"), effect: effect("watch") },
    { label: t("tars.prChecks.leaveStopped"), rationale: t("tars.prChecks.leaveStoppedHint"), effect: { kind: "reply" } },
  ] } : null;
  // The request text is stable across locale changes and is hidden as an automatic origin.
  // i18n-ignore: internal host notice identity, never rendered as user text
  const message = conversations.create({ requestId: tarsFollowUpRequestId(event.key), text: "Pull request check notice." }, at, undefined,
    { kind: "followUp", eventKey: event.key, responsibilityId: row.id, reason: event.kind as "ciFailed" | "ciPassed" | "ciUnavailable" | "prChangesRequested" | "prReviewNotice",
      observedRevision: row.revision, summary: "" });
  if (message.state !== "queued") return message.id;
  const claimed = conversations.claim(message.id, message.revision, at);
  const answered = conversations.answer(message.id, claimed.revision, { reply, actions: ask ? [ask] : [] }, at);
  if (ask) {
    const receipt = conversations.recordReceipt(answered.id, answered.revision, 0, ask, at);
    conversations.settleReceipt(answered.id, 0, receipt.revision, { status: "proposed" }, at);
  }
  return message.id;
}
