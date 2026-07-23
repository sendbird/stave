import type { ModelSelectorOption } from "./model-selector.utils";
import {
  CLAUDE_FABLE_MODEL,
  CODEX_MODEL_OPTIONS,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
} from "@/lib/providers/model-catalog";

export interface ModelEffortMatrixRow {
  option: ModelSelectorOption;
  context1MOption?: ModelSelectorOption;
  shortLabel: string;
}

const CLAUDE_MATRIX_MODELS = [
  {
    model: CLAUDE_FABLE_MODEL,
    shortLabel: "Fable",
  },
  {
    model: DEFAULT_CLAUDE_OPUS_MODEL,
    context1MModel: DEFAULT_CLAUDE_OPUS_1M_MODEL,
    shortLabel: "Opus",
  },
  {
    model: DEFAULT_CLAUDE_SONNET_MODEL,
    context1MModel: DEFAULT_CLAUDE_SONNET_1M_MODEL,
    shortLabel: "Sonnet",
  },
] as const;

const CODEX_MATRIX_LABELS: Readonly<Record<string, string>> = {
  "gpt-5.6-sol": "Sol",
  "gpt-5.6-terra": "Terra",
  "gpt-5.6-luna": "Luna",
};

export function buildClaudeModelEffortRows(
  options: readonly ModelSelectorOption[],
): ModelEffortMatrixRow[] {
  const optionByModel = new Map(
    options
      .filter((option) => option.providerId === "claude-code" && !option.isAuto)
      .map((option) => [option.model, option] as const),
  );

  return CLAUDE_MATRIX_MODELS.flatMap((entry) => {
    const option = optionByModel.get(entry.model);
    if (!option) {
      return [];
    }
    return [
      {
        option,
        context1MOption:
          "context1MModel" in entry
            ? optionByModel.get(entry.context1MModel)
            : undefined,
        shortLabel: entry.shortLabel,
      },
    ];
  });
}

export function buildCodexModelEffortRows(
  options: readonly ModelSelectorOption[],
): ModelEffortMatrixRow[] {
  const optionByModel = new Map(
    options
      .filter((option) => option.providerId === "codex" && !option.isAuto)
      .map((option) => [option.model, option] as const),
  );

  return CODEX_MODEL_OPTIONS.flatMap((model) => {
    const option = optionByModel.get(model);
    if (!option) {
      return [];
    }
    return [
      {
        option,
        shortLabel: CODEX_MATRIX_LABELS[model] ?? option.label,
      },
    ];
  });
}

export function resolveClaudeMatrixOption(args: {
  row: ModelEffortMatrixRow;
  context1M: boolean;
}) {
  return args.context1M && args.row.context1MOption
    ? args.row.context1MOption
    : args.row.option;
}

export function isClaudeContext1MModel(model: string) {
  return model.trim().toLowerCase().endsWith("[1m]");
}
