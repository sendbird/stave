const OMITTED_HISTORY_NOTICE =
  "[Some task history is omitted to fit the context budget. The earliest available user request and recent messages follow. Later corrections take precedence; consult task sources and saved plans for missing requirements.]";

/** The characters of task history a fresh or switched-back session receives. */
export const BOUNDED_HISTORY_MAX_CHARS = 12_000;

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = "\n[message excerpt omitted]\n";
  const head = Math.floor((limit - marker.length) / 2);
  return (
    text.slice(0, head) + marker + text.slice(-(limit - marker.length - head))
  );
}

/** What a bounded replay contains, besides its text. */
export interface BoundedHistoryPlan {
  text: string;
  /** Messages offered to the replay. */
  totalMessages: number;
  /** Messages in the replay, whole or shortened. */
  keptMessages: number;
  /** Kept messages cut in the middle to fit. */
  shortenedMessages: number;
  /** Messages left out entirely. */
  omittedMessages: number;
  /** The history did not fit the budget, so the omission notice leads the replay. */
  overflowed: boolean;
  maxChars: number;
  /** Which offered messages are in the replay, in order. */
  keptIndexes: number[];
}

/**
 * Bound replay without silently discarding the earliest available request or
 * role labels, and say what was kept. The provider prompt uses only the text;
 * the composer's switch notice uses the rest.
 */
export function planBoundedHistory(args: {
  messages: readonly { role: string; text: string }[];
  maxChars?: number;
}): BoundedHistoryPlan {
  const maxChars = args.maxChars ?? BOUNDED_HISTORY_MAX_CHARS;
  const lines = args.messages.map(
    (message) => `${message.role}: ${message.text}`,
  );
  const full = lines.join("\n");
  if (full.length <= maxChars) {
    return {
      // i18n-ignore: model-facing replay text, sent to the provider as-is
      text: full || "(no prior messages)",
      totalMessages: lines.length,
      keptMessages: lines.length,
      shortenedMessages: 0,
      omittedMessages: 0,
      overflowed: false,
      maxChars,
      keptIndexes: lines.map((_, index) => index),
    };
  }
  const anchorIndex = args.messages.findIndex(
    (message) => message.role === "user",
  );
  const anchor =
    anchorIndex >= 0
      ? shorten(lines[anchorIndex]!, Math.floor(maxChars / 4))
      : "";
  let shortenedMessages = anchor && anchor !== lines[anchorIndex] ? 1 : 0;
  let remaining = maxChars - OMITTED_HISTORY_NOTICE.length - anchor.length - 2;
  const tail: string[] = [];
  const tailIndexes: number[] = [];
  for (
    let index = lines.length - 1;
    index >= 0 && remaining > 100;
    index -= 1
  ) {
    if (anchorIndex >= 0 && index <= anchorIndex) break;
    const line = shorten(lines[index]!, Math.min(4_000, remaining - 1));
    if (line !== lines[index]) shortenedMessages += 1;
    tail.unshift(line);
    tailIndexes.unshift(index);
    remaining -= line.length + 1;
  }
  const keptMessages = tail.length + (anchor ? 1 : 0);
  return {
    text: [OMITTED_HISTORY_NOTICE, ...(anchor ? [anchor] : []), ...tail].join("\n"),
    totalMessages: lines.length,
    keptMessages,
    shortenedMessages,
    omittedMessages: lines.length - keptMessages,
    overflowed: true,
    maxChars,
    keptIndexes: [...(anchor ? [anchorIndex] : []), ...tailIndexes],
  };
}

/** Bound replay without silently discarding the earliest available request or role labels. */
export function buildBoundedHistory(args: {
  messages: readonly { role: string; text: string }[];
  maxChars?: number;
}): string {
  return planBoundedHistory(args).text;
}
