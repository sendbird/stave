import { i18n } from "@/i18n";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

/**
 * Explained option lists shared by the Providers and Models settings
 * sections. Models owns the default effort controls; Providers reuses the
 * type and guide builders for its runtime selects.
 */
export type ExplainedSelectOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  example?: string;
};

export const CLAUDE_EFFORT_HELP = [
  {
    value: "low",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.low"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.low.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.low.example"); },
  },
  {
    value: "medium",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.medium"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.medium.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.medium.example"); },
  },
  {
    value: "high",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.high"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.high.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.high.example"); },
  },
  {
    value: "xhigh",
    label: "X-High",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.xhigh.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.xhigh.example"); },
  },
  {
    value: "max",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.max"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.max.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.max.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudeEffort"]>
>[];

export const CODEX_REASONING_EFFORT_HELP = [
  {
    value: "minimal",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.minimal"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.minimal.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.minimal.example"); },
  },
  {
    value: "low",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.low"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.low.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.low.example"); },
  },
  {
    value: "medium",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.medium"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.medium.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.medium.example"); },
  },
  {
    value: "high",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.high"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.high.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.high.example"); },
  },
  {
    value: "xhigh",
    label: "X-High",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.xhigh.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.xhigh.example"); },
  },
  {
    value: "max",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.max"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.max.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.max.example"); },
  },
  {
    value: "ultra",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.ultra"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.ultra.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.ultra.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
>[];

export function buildGuideItems<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options.map((option) => ({
    label: option.label,
    description: option.description,
  }));
}

export function buildGuideExamples<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options
    .filter((option) => option.example)
    .map((option) => ({
      label: option.label,
      description: option.example ?? "",
    }));
}
