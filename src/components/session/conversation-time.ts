type TimedMessage = {
  role: "user" | "assistant";
  startedAt?: string;
  completedAt?: string;
};

export function validMessageTime(value?: string): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Group the transcript by the reader's local calendar, including loaded pages. */
export function buildConversationDateSeparators(
  messages: readonly (Pick<TimedMessage, "startedAt" | "completedAt"> & {
    id: string;
  })[],
): Map<string, string> {
  const separators = new Map<string, string>();
  let previousDay: string | undefined;
  for (const message of messages) {
    const value =
      validMessageTime(message.startedAt) ??
      validMessageTime(message.completedAt);
    if (!value) continue;
    const day = new Date(value).toDateString();
    if (day !== previousDay) separators.set(message.id, value);
    previousDay = day;
  }
  return separators;
}

export function getMessageTimeEntries(message: TimedMessage) {
  const entries: { kind: "sent" | "started" | "completed"; value: string }[] =
    [];
  const startedAt = validMessageTime(message.startedAt);
  const completedAt = validMessageTime(message.completedAt);
  if (startedAt)
    entries.push({
      kind: message.role === "user" ? "sent" : "started",
      value: startedAt,
    });
  if (message.role === "assistant" && completedAt)
    entries.push({ kind: "completed", value: completedAt });
  return entries;
}
