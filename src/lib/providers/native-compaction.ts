import { i18n } from "@/i18n/runtime";
/** Native compaction operates on one existing provider session, not task history. */
export function isConversationCompactCommand(input: string): boolean {
  return /^\/compact(?:\s|$)/i.test(input.trimStart());
}

export function requireCompactResumeSession(
  input: string,
  sessionId?: string | null,
) {
  if (isConversationCompactCommand(input) && !sessionId?.trim()) {
    throw new Error(
      i18n.t("providers:nativeCompaction.thereIsNoResumableConversationTo"),
    );
  }
}
