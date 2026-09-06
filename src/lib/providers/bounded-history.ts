const OMITTED_HISTORY_NOTICE =
  "[Some task history is omitted to fit the context budget. The earliest available user request and recent messages follow. Later corrections take precedence; consult task sources and saved plans for missing requirements.]";

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = "\n[message excerpt omitted]\n";
  const head = Math.floor((limit - marker.length) / 2);
  return (
    text.slice(0, head) + marker + text.slice(-(limit - marker.length - head))
  );
}

/** Bound replay without silently discarding the earliest available request or role labels. */
export function buildBoundedHistory(args: {
  messages: readonly { role: string; text: string }[];
  maxChars?: number;
}): string {
  const maxChars = args.maxChars ?? 12_000;
  const lines = args.messages.map(
    (message) => `${message.role}: ${message.text}`,
  );
  const full = lines.join("\n");
  if (full.length <= maxChars) return full || "(no prior messages)";
  const anchorIndex = args.messages.findIndex(
    (message) => message.role === "user",
  );
  const anchor =
    anchorIndex >= 0
      ? shorten(lines[anchorIndex]!, Math.floor(maxChars / 4))
      : "";
  let remaining = maxChars - OMITTED_HISTORY_NOTICE.length - anchor.length - 2;
  const tail: string[] = [];
  for (
    let index = lines.length - 1;
    index >= 0 && remaining > 100;
    index -= 1
  ) {
    if (anchorIndex >= 0 && index <= anchorIndex) break;
    const line = shorten(lines[index]!, Math.min(4_000, remaining - 1));
    tail.unshift(line);
    remaining -= line.length + 1;
  }
  return [OMITTED_HISTORY_NOTICE, ...(anchor ? [anchor] : []), ...tail].join(
    "\n",
  );
}
