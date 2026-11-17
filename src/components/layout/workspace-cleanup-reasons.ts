import { i18n } from "@/i18n";

/** Host reason codes are translated at presentation time, including compound blockers. */
export function workspaceCleanupReasonText(reason: string): string {
  if (reason.includes(",")) return reason.split(",").map(workspaceCleanupReasonText).join(" · ");
  if (reason.startsWith("inactive:")) return i18n.t("workspace:cleanupCenter.reasons.inactive", { count: Number(reason.split(":")[1]) });
  return i18n.t(`workspace:cleanupCenter.reasons.${reason}`, { defaultValue: i18n.t("workspace:cleanupCenter.reasonUnknown") });
}
