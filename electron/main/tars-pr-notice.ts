import { i18n } from "../../src/i18n/runtime";
import { TARS_CI_FIX_ROUNDS } from "../../src/lib/tars/pr-checks";
import { tarsFollowUpRequestId, type TarsEvent } from "../../src/lib/tars/events";
import type { TarsAskAction } from "../../src/lib/tars/conversation";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";

/** Host notices use the existing question/answer ledger and do not spend a planner turn. Caller holds its transaction. */
export function recordTarsPrNotice(conversations: TarsConversationStore, row: TarsResponsibility, event: TarsEvent, at: string): string | null {
  const cap = event.kind === "ciFailed" && (row.publication?.watch?.fixRounds ?? 0) >= TARS_CI_FIX_ROUNDS;
  if (event.kind !== "ciPassed" && event.kind !== "ciUnavailable" && !cap) return null;
  const t = i18n.getFixedT(null, "shell");
  const number = row.publication!.number!;
  const reply = cap ? t("tars.prChecks.limit", { number }) : event.kind === "ciPassed"
    ? t("tars.prChecks.passedNotice", { number }) : t("tars.prChecks.unavailableNotice", { number });
  const effect = (choice: "ready" | "keepDraft") => ({ kind: "prReview" as const, responsibilityId: row.id, headSha: event.episode, choice });
  const ask: TarsAskAction | null = event.kind === "ciPassed" ? { kind: "ask", question: t("tars.prChecks.question", { number }), options: [
    { label: t("tars.prChecks.ready"), rationale: t("tars.prChecks.readyHint"), effect: effect("ready") },
    { label: t("tars.prChecks.keepDraft"), rationale: t("tars.prChecks.keepHint"), effect: effect("keepDraft") },
  ] } : cap ? { kind: "ask", question: t("tars.prChecks.limitQuestion", { number, title: row.title }), options: [
    { label: t("tars.prChecks.continue"), rationale: t("tars.prChecks.continueHint"), effect: { kind: "reply" } },
    { label: t("tars.prChecks.stop"), rationale: t("tars.prChecks.stopHint"), effect: { kind: "reply" } },
  ] } : null;
  // The request text is stable across locale changes and is hidden as an automatic origin.
  // i18n-ignore: internal host notice identity, never rendered as user text
  const message = conversations.create({ requestId: tarsFollowUpRequestId(event.key), text: "Pull request check notice." }, at, undefined,
    { kind: "followUp", eventKey: event.key, responsibilityId: row.id, reason: event.kind as "ciFailed" | "ciPassed" | "ciUnavailable",
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
