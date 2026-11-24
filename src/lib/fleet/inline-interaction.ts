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
  | {
      kind: "approval";
      part: ApprovalPart;
      /** The whole request as one readable line, or null when Allow needs the task. */
      summary: string | null;
    }
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

const INLINE_APPROVAL_SUMMARY_MAX = 160;
const INLINE_APPROVAL_COMMAND_MAX = 120;

function readApprovalCommand(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return null;
    const command = (parsed as { command?: unknown }).command;
    if (typeof command === "string") return command.trim() || null;
    if (Array.isArray(command) && command.every((item) => typeof item === "string")) {
      return command.join(" ").trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * What a row shows before it offers Allow once. A row answers an approval only
 * when it can show the whole request: nothing marks it risky, the summary is
 * one line, and any command is short enough to read in full. Otherwise Allow
 * is left to the task, as macOS notification actions already do; Deny stays.
 */
export function readInlineApprovalSummary(part: ApprovalPart): string | null {
  if (part.risk) return null;
  const description = part.description.trim();
  const command = readApprovalCommand(part.input);
  if (!description && !command) return null;
  if (description.includes("\n") || description.length > INLINE_APPROVAL_SUMMARY_MAX) return null;
  if (command && (command.includes("\n") || command.length > INLINE_APPROVAL_COMMAND_MAX)) return null;
  return command && !description.includes(command)
    ? [description, command].filter(Boolean).join(" · ")
    : description;
}

export function classifyFleetInlineInteraction(
  part: ApprovalPart | UserInputPart | null | undefined,
  optionCount: { min: number; max: number } = FLEET_SHORT_QUESTION_OPTIONS,
): FleetInlineInteraction {
  if (!part) {
    return OPEN;
  }
  if (part.type === "approval") {
    return part.state === "approval-requested"
      ? { kind: "approval", part, summary: readInlineApprovalSummary(part) }
      : OPEN;
  }
  if (part.state !== "input-requested" || part.questions.length !== 1) {
    return OPEN;
  }
  const question = part.questions[0]!;
  if (
    question.multiSelect === true ||
    TYPED_INPUT_TYPES.has(question.inputType) ||
    question.options.length < optionCount.min ||
    question.options.length > optionCount.max
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
