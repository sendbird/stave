import {
  encodeUserInputSelection,
  getUserInputAnswerKey,
} from "@/lib/user-input-answers";
import type {
  ApprovalPart,
  UserInputPart,
  UserInputQuestion,
} from "@/types/chat";

/** Fewest and most options a question can have and still be answered in a row. */
export const FLEET_SHORT_QUESTION_OPTIONS = { min: 2, max: 6 } as const;

export interface FleetShortQuestionOption {
  label: string;
  value: string;
  description?: string;
}

/**
 * How a pending request can be answered from a Fleet row.
 *
 * - `approval`: allow once / always / deny, in the row.
 * - `short-question`: one single-select question with 2–6 options, picked in
 *   the row. Its other forms (a free-text "other" answer the composer card
 *   offers) stay in the task.
 * - `open`: everything else — several questions, multi-select, free text,
 *   numbers, links, or a request no longer pending — is answered in the task.
 */
export type FleetInlineInteraction =
  | { kind: "approval"; part: ApprovalPart }
  | {
      kind: "short-question";
      part: UserInputPart;
      question: UserInputQuestion;
      options: FleetShortQuestionOption[];
    }
  | { kind: "open" };

const OPEN: FleetInlineInteraction = { kind: "open" };

/** Questions whose answer is typed rather than picked. */
const TYPED_INPUT_TYPES: ReadonlySet<UserInputQuestion["inputType"]> = new Set([
  "text",
  "number",
  "integer",
  "url_notice",
]);

export function classifyFleetInlineInteraction(
  part: ApprovalPart | UserInputPart | null | undefined,
): FleetInlineInteraction {
  if (!part) {
    return OPEN;
  }
  if (part.type === "approval") {
    return part.state === "approval-requested" ? { kind: "approval", part } : OPEN;
  }
  if (part.state !== "input-requested" || part.questions.length !== 1) {
    return OPEN;
  }
  const question = part.questions[0]!;
  if (
    question.multiSelect === true ||
    TYPED_INPUT_TYPES.has(question.inputType) ||
    question.options.length < FLEET_SHORT_QUESTION_OPTIONS.min ||
    question.options.length > FLEET_SHORT_QUESTION_OPTIONS.max
  ) {
    return OPEN;
  }
  return {
    kind: "short-question",
    part,
    question,
    options: question.options.map((option) => ({
      label: option.label,
      value: option.value ?? option.label,
      ...(option.description ? { description: option.description } : {}),
    })),
  };
}

/** The answers a picked option sends, in the encoding every surface uses. */
export function buildShortQuestionAnswers(
  question: UserInputQuestion,
  option: Pick<FleetShortQuestionOption, "value">,
): Record<string, string> {
  return {
    [getUserInputAnswerKey(question)]: encodeUserInputSelection([option.value]),
  };
}
