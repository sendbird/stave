import { i18n } from "@/i18n/runtime";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type ClaudeThinkingMode = NonNullable<
  ProviderRuntimeOptions["claudeThinkingMode"]
>;

/** The mode a Claude turn uses when Settings holds none. */
export const DEFAULT_CLAUDE_THINKING_MODE: ClaudeThinkingMode = "adaptive";

/**
 * The three Claude thinking modes with what each one does, read by the
 * Settings select and its guide and by the composer's Thinking menu, so both
 * describe a mode in the same words.
 */
export const CLAUDE_THINKING_MODE_HELP = [
  {
    value: "adaptive",
    get label() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.example"); },
  },
  {
    value: "enabled",
    get label() { return i18n.t("common:status.enabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.enabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.enabled.example"); },
  },
  {
    value: "disabled",
    get label() { return i18n.t("common:status.disabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.disabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.disabled.example"); },
  },
] as const satisfies readonly {
  value: ClaudeThinkingMode;
  label: string;
  description: string;
  example: string;
}[];

/** The help entry for `mode`, falling back to the default mode's. */
export function getClaudeThinkingModeHelp(
  mode: ClaudeThinkingMode | null | undefined,
) {
  return (
    CLAUDE_THINKING_MODE_HELP.find((option) => option.value === mode) ??
    CLAUDE_THINKING_MODE_HELP[0]
  );
}
