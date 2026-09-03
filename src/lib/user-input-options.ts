import type { UserInputOption } from "@/types/chat";

const RECOMMENDED_LABEL_SUFFIX = /\s*\(\s*recommended\s*\)\s*$/i;

export function isRecommendedUserInputFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function optionLabelHasRecommendedSuffix(label: string): boolean {
  return RECOMMENDED_LABEL_SUFFIX.test(label);
}

export function displayUserInputOptionLabel(label: string): string {
  const stripped = label.replace(RECOMMENDED_LABEL_SUFFIX, "").trim();
  return stripped || label;
}

export function shouldShowUserInputRecommendedBadge(args: {
  option: { recommended?: boolean; label: string };
  options: Array<{ recommended?: boolean; label: string }>;
}): boolean {
  if (args.options.some((option) => option.recommended === true)) {
    return args.option.recommended === true;
  }
  return optionLabelHasRecommendedSuffix(args.option.label);
}

export function readRawOptionRecommended(raw: {
  recommended?: unknown;
  recommend?: unknown;
}): boolean {
  return (
    isRecommendedUserInputFlag(raw.recommended) ||
    isRecommendedUserInputFlag(raw.recommend)
  );
}

export function readQuestionRecommendPointer(question: {
  recommended?: unknown;
  recommend?: unknown;
  recommendedOption?: unknown;
  recommendedIndex?: unknown;
}): unknown {
  if (question.recommended !== undefined) {
    return question.recommended;
  }
  if (question.recommend !== undefined) {
    return question.recommend;
  }
  if (question.recommendedOption !== undefined) {
    return question.recommendedOption;
  }
  if (question.recommendedIndex !== undefined) {
    return question.recommendedIndex;
  }
  return undefined;
}

function resolveRecommendPointer(args: {
  options: Array<{ label: string; value?: string }>;
  recommend: unknown;
}): number | null {
  if (
    args.recommend == null ||
    args.recommend === false ||
    args.recommend === true
  ) {
    // A question-level boolean must not collapse to "first option".
    return null;
  }

  if (typeof args.recommend === "number" && Number.isFinite(args.recommend)) {
    const index = Math.trunc(args.recommend);
    if (index >= 0 && index < args.options.length) {
      return index;
    }
    if (index >= 1 && index <= args.options.length) {
      return index - 1;
    }
    return null;
  }

  if (typeof args.recommend !== "string") {
    return null;
  }
  const raw = args.recommend.trim();
  if (!raw) {
    return null;
  }
  const matched = args.options.findIndex(
    (option) =>
      option.value === raw ||
      option.label === raw ||
      displayUserInputOptionLabel(option.label) === raw,
  );
  if (matched >= 0) {
    return matched;
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return resolveRecommendPointer({
    options: args.options,
    recommend: numeric,
  });
}

export function resolveRecommendedOptionIndex(args: {
  options: Array<{ label: string; value?: string; recommended?: boolean }>;
  recommend?: unknown;
}): number | null {
  const flagged = args.options.findIndex(
    (option) => option.recommended === true,
  );
  if (flagged >= 0) {
    return flagged;
  }
  const labeled = args.options.findIndex((option) =>
    optionLabelHasRecommendedSuffix(option.label),
  );
  if (labeled >= 0) {
    return labeled;
  }
  return resolveRecommendPointer({
    options: args.options,
    recommend: args.recommend,
  });
}

export function markRecommendedUserInputOptions<
  T extends { label: string; value?: string; recommended?: boolean },
>(args: { options: T[]; recommend?: unknown }): T[] {
  const recommendedIndex = resolveRecommendedOptionIndex(args);
  return args.options.map((option, optionIndex) => {
    if (optionIndex === recommendedIndex) {
      return { ...option, recommended: true };
    }
    if (option.recommended !== true) {
      return option;
    }
    const { recommended: _recommended, ...rest } = option;
    return rest as T;
  });
}

export function recommendedOptionDefaultValue(args: {
  options: Array<Pick<UserInputOption, "label" | "value" | "recommended">>;
  multiSelect?: boolean;
}): string | undefined {
  if (args.multiSelect) {
    return undefined;
  }
  const recommended = args.options.filter(
    (option) => option.recommended === true,
  );
  if (recommended.length !== 1) {
    return undefined;
  }
  return recommended[0]?.value ?? recommended[0]?.label;
}
