import type { UpdateModelRuntimePreferenceArgs } from "@/lib/providers/model-runtime-preferences";
import { shouldPersistCursorComposerSelection } from "./cursor-model-runtime";
import {
  getClaudeContextBaseModel,
  isClaudeContext1MModel,
  listModelEfforts,
  resolveDefaultModelEffort,
  type ModelEffortValue,
} from "./model-effort-selector.utils";
import type { ModelSelectorOption } from "./model-selector.utils";

/**
 * The effort the model picker marks as selected for `value`: none for Stave
 * Auto or a model without levels, else the composer's effort, falling back to
 * the model's default. The picker and the effort shortcuts both read it, so
 * they always agree on where a step starts.
 */
export function resolveSelectedModelEffort(args: {
  value: ModelSelectorOption;
  effortValue?: string;
}): ModelEffortValue | undefined {
  if (args.value.isAuto || listModelEfforts(args.value).length === 0) {
    return undefined;
  }
  return (
    (args.effortValue as ModelEffortValue | undefined) ??
    resolveDefaultModelEffort(args.value)
  );
}

export type ModelEffortStepDirection = 1 | -1;

/**
 * The picker choice one effort level up (`1`) or down (`-1`) from the selected
 * one, through the levels the picker lists for the selected model's row.
 * `null` when there is nothing to step: Stave Auto, a model without levels,
 * or the selection already at the end it would step past (no wrap-around).
 */
export function stepModelEffort(args: {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  effortValue?: string;
  direction: ModelEffortStepDirection;
}): { selection: ModelSelectorOption; effort: ModelEffortValue } | null {
  if (args.value.isAuto) {
    return null;
  }
  // The picker lists levels from the model's catalog row, which carries the
  // per-model support the bare composer value may not.
  const row =
    args.options.find((option) => option.key === args.value.key) ?? args.value;
  const levels = listModelEfforts(row);
  if (levels.length === 0) {
    return null;
  }
  const current = resolveSelectedModelEffort({
    value: row,
    effortValue: args.effortValue,
  });
  const index = levels.findIndex((level) => level.value === current);
  if (index < 0) {
    // The held effort is not one this model offers: land on the model's
    // default, the level the picker would show for it.
    const fallback =
      levels.find((level) => level.value === resolveDefaultModelEffort(row)) ??
      levels[0]!;
    return { selection: row, effort: fallback.value };
  }
  const next = levels[index + args.direction];
  return next ? { selection: row, effort: next.value } : null;
}

/**
 * What the picker remembers when a model and effort are chosen, before the
 * choice reaches the composer: Cursor keeps its last effort per model and
 * Claude its 1M context choice.
 */
export function persistModelPickerPreferences(args: {
  option: ModelSelectorOption;
  effort?: ModelEffortValue;
  updateModelRuntimePreference: (args: UpdateModelRuntimePreferenceArgs) => void;
}) {
  const { option, effort } = args;
  if (
    shouldPersistCursorComposerSelection({
      providerId: option.providerId,
      effort,
    })
  ) {
    args.updateModelRuntimePreference({
      providerId: "cursor",
      model: option.model,
      patch: {
        ...(effort ? { effort } : {}),
      },
    });
  }
  if (option.providerId === "claude-code" && !option.isAuto) {
    args.updateModelRuntimePreference({
      providerId: "claude-code",
      model: getClaudeContextBaseModel(option.model),
      patch: { context1M: isClaudeContext1MModel(option.model) },
    });
  }
}
