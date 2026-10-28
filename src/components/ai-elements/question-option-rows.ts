import {
  displayUserInputOptionLabel,
  shouldShowUserInputRecommendedBadge,
} from "@/lib/user-input-options";
import type { UserInputQuestion } from "@/types/chat";

/** Number keys 1-9 pick the matching option of the visible question. */
export const QUESTION_OPTION_SHORTCUT_LIMIT = 9;

/** One answer row, as every question surface draws it. */
export interface QuestionOptionRowModel {
  /** The value sent to the provider: the option's value, or its label. */
  value: string;
  /** The label shown, with a trailing recommendation marker removed. */
  label: string;
  description: string | null;
  recommended: boolean;
  selected: boolean;
  /** The 1-9 number key that picks the row, or `null` when it has none. */
  shortcut: number | null;
}

export function getQuestionOptionValue(
  option: UserInputQuestion["options"][number],
): string {
  return option.value ?? option.label;
}

function toShortcut(index: number, showShortcuts: boolean): number | null {
  const shortcut = index + 1;
  return showShortcuts && shortcut <= QUESTION_OPTION_SHORTCUT_LIMIT
    ? shortcut
    : null;
}

/**
 * The rows a question's options render as. Shortcuts are only offered where
 * the number keys actually pick an option (the answering panel), never in a
 * read-only record or a surface without that keyboard handling.
 */
export function buildQuestionOptionRows(args: {
  question: Pick<UserInputQuestion, "options">;
  selectedValues: readonly string[];
  showShortcuts: boolean;
}): QuestionOptionRowModel[] {
  const selected = new Set(args.selectedValues);
  return args.question.options.map((option, index) => {
    const value = getQuestionOptionValue(option);
    return {
      value,
      label: displayUserInputOptionLabel(option.label),
      description: option.description?.trim() ? option.description : null,
      recommended: shouldShowUserInputRecommendedBadge({
        option,
        options: args.question.options,
      }),
      selected: selected.has(value),
      shortcut: toShortcut(index, args.showShortcuts),
    };
  });
}

/**
 * The number key that moves focus to the free-text row, which follows the
 * options, or `null` when it is past the 1-9 range.
 */
export function getCustomAnswerShortcut(args: {
  optionCount: number;
  showShortcuts: boolean;
}): number | null {
  return toShortcut(args.optionCount, args.showShortcuts);
}
