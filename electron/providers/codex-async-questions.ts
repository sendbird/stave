import { CODEX_ASYNC_QUESTION_REQUEST_PREFIX } from "../../src/lib/async-question-answer";
import type { BridgeEvent } from "./types";

/**
 * Map a Codex `agentMessage` item with `delivery: "async"` to a question card.
 *
 * Codex emits it for `request_user_input_async`: the tool returns at once and
 * the turn keeps running, so there is no pending App Server request to answer.
 * The item id is the tool call id. Codex lists the recommended option first and
 * preselects it; the card does the same. The item's text repeats the questions
 * and stays a text part with the item id as its segment id.
 */
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
      ? raw.options.filter((option: unknown): option is string => typeof option === "string" && option.trim().length > 0)
      : [];
    return [{
      key: `question-${index}`,
      question: raw.title,
      header: "",
      options: labels.map((label) => ({ label, description: "" })),
      allowCustom: true,
      ...(labels[0] ? { defaultValue: labels[0] } : {}),
    }];
  });
  return questions.length ? {
    type: "user_input",
    delivery: "async",
    requestId: `${CODEX_ASYNC_QUESTION_REQUEST_PREFIX}${value.id}`,
    toolName: "request_user_input_async",
    questions,
  } : null;
}
