import type { UserInputQuestion } from "@/types/chat";

/**
 * One answer encoding for every surface that answers a question card: the
 * composer card, the transcript's clarification, the child request slot and
 * Fleet's row.
 *
 * Providers match an answer by the question it answers, so an answer is filed
 * under the question's own `key`, or its text when it has none (Claude reads
 * answers by question text). Several picks of a multi-select question are one
 * string joined with ", ". A question must be answered unless the provider
 * marked it `required: false`; a link notice asks for nothing.
 */
export const USER_INPUT_MULTI_SELECT_SEPARATOR = ", ";

export function getUserInputAnswerKey(
  question: Pick<UserInputQuestion, "key" | "question">,
) {
  return question.key?.trim() || question.question;
}

export function encodeUserInputSelection(values: readonly string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .join(USER_INPUT_MULTI_SELECT_SEPARATOR);
}

export function isUserInputAnswerRequired(
  question: Pick<UserInputQuestion, "inputType" | "required">,
) {
  return question.inputType !== "url_notice" && question.required !== false;
}

/**
 * The recorded answer to a question. Older transcript answers were filed
 * under the question's header (or its position when it had none), so those
 * keys are read too; new answers are never written under them.
 */
export function readUserInputAnswer(args: {
  answers: Readonly<Record<string, string>> | undefined;
  question: Pick<UserInputQuestion, "key" | "question" | "header">;
  index: number;
}) {
  const { answers, question } = args;
  if (!answers) {
    return undefined;
  }
  return (
    answers[getUserInputAnswerKey(question)] ??
    answers[question.question] ??
    (question.header ? answers[question.header] : undefined) ??
    answers[`question-${args.index}`]
  );
}
