import type { BridgeEvent } from "./types";

/** Async questions are messages, not pending App Server RPC requests. */
export function mapCodexAsyncQuestions(item: unknown): BridgeEvent | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  if (
    value.type !== "agentMessage" || value.delivery !== "async" ||
    typeof value.id !== "string" || !value.id || !Array.isArray(value.questions)
  ) return null;
  const questions = value.questions.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || typeof raw.title !== "string" || !raw.title.trim()) return [];
    const labels: string[] = Array.isArray(raw.options)
      ? raw.options.filter((option: unknown): option is string => typeof option === "string")
      : [];
    return [{
      key: `question-${index}`,
      question: raw.title,
      header: "",
      options: labels.map((label) => ({ label, description: "" })),
      allowCustom: true,
    }];
  });
  return questions.length ? {
    type: "user_input",
    delivery: "async",
    requestId: `codex-async:${value.id}`,
    toolName: "request_user_input_async",
    questions,
  } : null;
}
