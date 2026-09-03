import type { UserInputQuestion } from "../../src/types/chat";
import {
  markRecommendedUserInputOptions,
  optionLabelHasRecommendedSuffix,
  readQuestionRecommendPointer,
  readRawOptionRecommended,
  recommendedOptionDefaultValue,
} from "../../src/lib/user-input-options";
import { isRecord } from "./codex-app-server-json";

/** Map an untyped Codex user-input request into Stave's shared question shape. */
export function mapCodexUserInputQuestions(
  questions: Array<Record<string, unknown>>,
): UserInputQuestion[] {
  return questions.map((question) => {
    const options = markRecommendedUserInputOptions({
      options: Array.isArray(question.options)
        ? question.options.map((option) => {
            const raw = isRecord(option) ? option : {};
            const label = typeof raw.label === "string" ? raw.label : "";
            const value = typeof raw.value === "string" ? raw.value : undefined;
            return {
              label,
              description:
                typeof raw.description === "string" ? raw.description : "",
              ...(value ? { value } : {}),
              ...(readRawOptionRecommended(raw) ||
              optionLabelHasRecommendedSuffix(label)
                ? { recommended: true }
                : {}),
            };
          })
        : [],
      recommend: readQuestionRecommendPointer(question),
    });
    const defaultValue = recommendedOptionDefaultValue({ options });
    return {
      header: typeof question.header === "string" ? question.header : "",
      key: typeof question.key === "string" ? question.key : undefined,
      question: typeof question.question === "string" ? question.question : "",
      multiSelect: false,
      inputType: "text" as const,
      options,
      ...(defaultValue ? { defaultValue } : {}),
    };
  });
}
