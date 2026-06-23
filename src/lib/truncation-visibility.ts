import type { MessagePart } from "@/types/chat";

export type TruncationNoticeSource =
  | "system"
  | "tool_input"
  | "tool_output"
  | "request";

export interface TruncationNotice {
  title: string;
  description: string;
}

export const PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE =
  "Response was cut off because the model output limit was reached.";

export const PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE =
  "Stave truncated part of this run's provider output because it exceeded the retained output limit.";

const TRUNCATION_PATTERNS: RegExp[] = [
  /\boutput_overflow\b/i,
  /\bmax_tokens\b/i,
  /response was cut off/i,
  /output was truncated/i,
  /\bcontent truncated\b/i,
  /\btool output truncated\b/i,
  /\bapproval description truncated\b/i,
  /<[^>\n]*truncated[^>\n]*>/i,
  /\[[^\]\n]*truncated[^\]\n]*\]/i,
  /<!--\s*truncated\s*-->/i,
];

export function isProviderOutputTruncationStopReason(
  stopReason?: string | null,
) {
  return stopReason === "max_tokens" || stopReason === "output_overflow";
}

export function buildProviderOutputTruncationNotice(
  stopReason?: string | null,
): string | null {
  if (stopReason === "max_tokens") {
    return PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE;
  }
  if (stopReason === "output_overflow") {
    return PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE;
  }
  return null;
}

export function hasTruncationMarker(text?: string | null) {
  const value = text ?? "";
  if (!value.trim()) {
    return false;
  }
  return TRUNCATION_PATTERNS.some((pattern) => pattern.test(value));
}

function buildTruncationDescription(source: TruncationNoticeSource) {
  switch (source) {
    case "tool_input":
      return "The tool input was shortened before display or model reuse. The omitted content may matter.";
    case "tool_output":
      return "The tool output was shortened before display or model reuse. The visible output may be incomplete.";
    case "request":
      return "Part of the request payload was shortened before it was sent. The model may not have seen every detail.";
    case "system":
      return "Some output was omitted because it exceeded a size limit. Treat the visible result as incomplete.";
  }
}

export function detectTruncationNotice(args: {
  text?: string | null;
  source?: TruncationNoticeSource;
}): TruncationNotice | null {
  if (!hasTruncationMarker(args.text)) {
    return null;
  }
  return {
    title: "Output truncated",
    description: buildTruncationDescription(args.source ?? "system"),
  };
}

export function appendProviderOutputTruncationNotice(args: {
  parts: MessagePart[];
  stopReason?: string | null;
}): MessagePart[] {
  const content = buildProviderOutputTruncationNotice(args.stopReason);
  if (!content) {
    return args.parts;
  }
  const alreadyVisible = args.parts.some(
    (part) =>
      part.type === "system_event" &&
      detectTruncationNotice({ text: part.content, source: "system" }),
  );
  if (alreadyVisible) {
    return args.parts;
  }
  return [...args.parts, { type: "system_event", content }];
}
