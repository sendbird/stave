import { formatDateTime } from "@/i18n/format";
import { i18n } from "@/i18n";
import type { ProviderId } from "@/lib/providers/provider.types";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { quotaObservations } from "@/lib/providers/usage-statistics";
import { QuotaReadFeedbackSchema, type QuotaReadFeedback } from "@/lib/providers/quota-read-feedback";

export type QuotaReadResult = { error: string | null; feedback: QuotaReadFeedback | null };
export type QuotaReader = (providerId: ProviderId, accountProfileId: string) => Promise<QuotaReadResult>;

export async function readQuota(providerId: ProviderId, accountProfileId: string): Promise<QuotaReadResult> {
  const read = window.api?.provider?.getRateLimitsSnapshot;
  if (!read) return { error: i18n.t("usage:quotaReadFeedback.quotaReadsAreAvailableInThe"), feedback: null };
  const snapshot = await read({ providers: [providerId], force: true, reason: "manual",
    runtimeOptions: { claudeAccountProfileId: providerId === "claude-code" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID,
      codexAccountProfileId: providerId === "codex" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID } });
  const key = providerId === "claude-code" ? "claude" : providerId;
  const parsed = QuotaReadFeedbackSchema.safeParse(snapshot.reads?.[providerId]);
  return {
    error: quotaObservations(snapshot, providerId, accountProfileId, new Date().toISOString()).length > 0
      ? null : snapshot[key].error ?? i18n.t("usage:quotaReadFeedback.thisAccountDidNotReportQuota"),
    feedback: parsed.success ? parsed.data : null,
  };
}

export function quotaReadFeedbackText(feedback: QuotaReadFeedback | null | undefined, timeZone: string, now: number) {
  if (!feedback) return null;
  const time = (value: string) => formatDateTime(value, {
    timeZone, dateStyle: "medium", timeStyle: "medium",
  });
  const parts = [feedback.status === "fresh" ? i18n.t("usage:quotaReadFeedback.quotaUpdatedFromTheProvider")
    : feedback.status === "cached" ? i18n.t("usage:quotaReadFeedback.showingTheLastReading")
      : feedback.reason === "request" || feedback.reason === "in-flight" ? i18n.t("usage:quotaReadFeedback.theQuotaReadFailed") : i18n.t("usage:quotaReadFeedback.quotaWasNotReadAgain")];
  if (feedback.reason === "manual-floor") parts.push(i18n.t("usage:quotaReadFeedback.recentReadsAreReusedToAvoid"));
  if (feedback.nextRefreshAt && Date.parse(feedback.nextRefreshAt) > now) {
    parts.push(i18n.t("usage:quotaReadFeedback.youCanRefreshAgainAt", { value1: time(feedback.nextRefreshAt) }));
  } else if (feedback.nextRefreshAt) parts.push(i18n.t("usage:quotaReadFeedback.youCanRefreshAgainNow"));
  if (feedback.lastReadFailed && feedback.nextAutomaticReadAt && Date.parse(feedback.nextAutomaticReadAt) > now) {
    parts.push(i18n.t("usage:quotaReadFeedback.automaticReadsPauseAfterAnError", { value1: time(feedback.nextAutomaticReadAt) }));
  }
  return parts.join(" ");
}
