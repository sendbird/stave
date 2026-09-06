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
      "There is no resumable conversation to compact for this provider. Send a normal message to synchronize the task context first.",
    );
  }
}
