import type { ChatMessage, MessagePart, ToolUsePart } from "@/types/chat";
export interface AdvisorTranscriptExchange {
  id: string;
  question: string;
  answer: string;
  state: string;
}

function missingAdvisorAnswer(state: string): string {
  if (state === "output-error") {
    return "Advisor response failed before an answer was captured.";
  }
  if (state !== "output-available") {
    return "Advisor response is still in progress.";
  }
  return "No answer captured.";
}

export function isAdvisorTranscriptToolPart(
  part: MessagePart,
): part is ToolUsePart {
  return (
    part.type === "tool_use" &&
    /(?:^|__|\.)stave_consult_advisor$/.test(part.toolName)
  );
}

/** Recover user-visible exchanges from the canonical transcript after restart. */
export function selectAdvisorTranscriptExchanges(
  messages: readonly ChatMessage[],
  maxExchanges = 24,
): AdvisorTranscriptExchange[] {
  const rows: AdvisorTranscriptExchange[] = [];
  for (
    let i = messages.length - 1;
    i >= 0 && rows.length < maxExchanges;
    i--
  ) {
    const message = messages[i]!;
    for (
      let j = message.parts.length - 1;
      j >= 0 && rows.length < maxExchanges;
      j--
    ) {
      const part = message.parts[j]!;
      if (!isAdvisorTranscriptToolPart(part)) continue;
      let question = "Original question unavailable.";
      try {
        const input = JSON.parse(part.input) as unknown;
        if (
          input &&
          typeof input === "object" &&
          "question" in input &&
          typeof input.question === "string"
        )
          question = input.question.slice(0, 8000);
      } catch {
        /* Never show incomplete raw input containing a consult grant. */
      }
      let answer = part.output?.trim() || missingAdvisorAnswer(part.state);
      try {
        const parsed = JSON.parse(answer) as {
          consult?: { advice?: unknown; message?: unknown; error?: unknown };
          advice?: unknown;
          message?: unknown;
          error?: unknown;
        };
        const result = parsed?.consult ?? parsed;
        const text = result?.advice ?? result?.message ?? result?.error;
        if (typeof text === "string") answer = text;
      } catch {
        /* Provider may already report plain text. */
      }
      rows.push({
        id: `${message.id}:${part.toolUseId ?? j}`,
        question,
        answer: answer.slice(0, 12000),
        state: part.state,
      });
    }
  }
  return rows;
}
