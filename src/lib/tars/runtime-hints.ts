import { SecondaryRunRuntimeHintsSchema, type SecondaryRunRuntimeHints } from "../runs/secondary-run";
import { selectedProviderAccount } from "../providers/provider-account-selection";
import type { TarsConversationSettings } from "./conversation";

/** Project current settings into the non-secret secondary contract before sending a message. */
export function buildTarsRuntimeHints(providerId: "claude-code" | "codex", settings: object): SecondaryRunRuntimeHints {
  const values = settings as Record<string, unknown>;
  const prefix = providerId === "codex" ? "codex" : "claude";
  const hints: Record<string, unknown> = {};
  for (const key of Object.keys(SecondaryRunRuntimeHintsSchema.shape)) {
    if (!key.startsWith(prefix) || values[key] === undefined || values[key] === "") continue;
    // App settings use zero for no task token budget; secondary inputs omit it.
    if (key === "claudeTaskBudgetTokens" && values[key] === 0) continue;
    hints[key] = key === "codexReasoningEffort" && values[key] === "minimal" ? "low" : values[key];
  }
  return SecondaryRunRuntimeHintsSchema.parse(hints);
}

/**
 * The account a saved conversation selection runs with, and the options the
 * settings sheet loads that provider's models with. Only the saved hints name
 * it: a missing account is System default, as in the executor and in execution
 * resources, never the app's current default.
 */
export function tarsAccountSelection(settings: Pick<TarsConversationSettings, "providerId" | "runtimeHints">, appSettings: object) {
  const accountId = selectedProviderAccount(settings.providerId, settings.runtimeHints);
  const accountKey = settings.providerId === "codex" ? "codexAccountProfileId" as const : "claudeAccountProfileId" as const;
  const runtimeOptions = { ...buildTarsRuntimeHints("codex", appSettings), ...buildTarsRuntimeHints("claude-code", appSettings),
    ...settings.runtimeHints, [accountKey]: accountId };
  return { accountId, accountKey, runtimeOptions };
}
