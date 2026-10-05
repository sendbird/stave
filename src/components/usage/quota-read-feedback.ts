import type { ProviderId } from "@/lib/providers/provider.types";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { quotaObservations } from "@/lib/providers/usage-statistics";
import { QuotaReadFeedbackSchema, type QuotaReadFeedback } from "@/lib/providers/quota-read-feedback";

export type QuotaReadResult = { error: string | null; feedback: QuotaReadFeedback | null };
export type QuotaReader = (providerId: ProviderId, accountProfileId: string) => Promise<QuotaReadResult>;

export async function readQuota(providerId: ProviderId, accountProfileId: string): Promise<QuotaReadResult> {
  const read = window.api?.provider?.getRateLimitsSnapshot;
  if (!read) return { error: "Quota reads are available in the desktop app.", feedback: null };
  const snapshot = await read({ providers: [providerId], force: true, reason: "manual",
    runtimeOptions: { claudeAccountProfileId: providerId === "claude-code" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID,
      codexAccountProfileId: providerId === "codex" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID } });
  const key = providerId === "claude-code" ? "claude" : providerId;
  const parsed = QuotaReadFeedbackSchema.safeParse(snapshot.reads?.[providerId]);
  return {
    error: quotaObservations(snapshot, providerId, accountProfileId, new Date().toISOString()).length > 0
      ? null : snapshot[key].error ?? "This account did not report quota limits.",
    feedback: parsed.success ? parsed.data : null,
  };
}

export function quotaReadFeedbackText(feedback: QuotaReadFeedback | null | undefined, timeZone: string, now: number) {
  if (!feedback) return null;
  const time = (value: string) => new Intl.DateTimeFormat(undefined, {
    timeZone, dateStyle: "medium", timeStyle: "medium",
  }).format(new Date(value));
  const parts = [feedback.status === "fresh" ? "Quota updated from the provider."
    : feedback.status === "cached" ? "Showing the last reading."
      : feedback.reason === "request" || feedback.reason === "in-flight" ? "The quota read failed." : "Quota was not read again."];
  if (feedback.reason === "manual-floor") parts.push("Recent reads are reused to avoid repeated requests.");
  if (feedback.nextRefreshAt && Date.parse(feedback.nextRefreshAt) > now) {
    parts.push(`You can refresh again at ${time(feedback.nextRefreshAt)}.`);
  } else if (feedback.nextRefreshAt) parts.push("You can refresh again now.");
  if (feedback.lastReadFailed && feedback.nextAutomaticReadAt && Date.parse(feedback.nextAutomaticReadAt) > now) {
    parts.push(`Automatic reads pause after an error and can resume at ${time(feedback.nextAutomaticReadAt)}.`);
  }
  return parts.join(" ");
}
