import { i18n } from "@/i18n/runtime";
/** Minimum verified by the provider's model-version rejection. */
export const CLAUDE_OPUS_55_MINIMUM_VERSION = "2.1.280";
/** Claude Code version that resolves the `sonnet` alias to Sonnet 5.5. */
export const CLAUDE_SONNET_55_MINIMUM_VERSION = "2.1.284";
/** Claude Code version that adds Haiku 5.5 and resolves `haiku` to it. */
export const CLAUDE_HAIKU_55_MINIMUM_VERSION = "2.1.293";

/** Routing prefixes do not change the underlying Claude model's capabilities. */
export function normalizeClaudeModelId(model?: string) {
  return (model ?? "").trim().replace(/^(?:claude-code\/)?(?:anthropic\/)?/, "");
}

export function getClaudeModelVersionGuidance(model: string): string | undefined {
  const trimmed = normalizeClaudeModelId(model);
  if (/^claude-opus-5-5(?:\[1m\])?$/.test(trimmed)) {
    return i18n.t("providers:claudeModelRequirements.requiresClaudeCodeOrNewerRun", { value1: CLAUDE_OPUS_55_MINIMUM_VERSION });
  }
  if (/^claude-sonnet-5-5(?:\[1m\])?$/.test(trimmed)) {
    return i18n.t("providers:claudeModelRequirements.requiresClaudeCodeOrNewerRun", { value1: CLAUDE_SONNET_55_MINIMUM_VERSION });
  }
  if (/^claude-haiku-5-5$/.test(trimmed)) {
    return i18n.t("providers:claudeModelRequirements.requiresClaudeCodeOrNewerRun", { value1: CLAUDE_HAIKU_55_MINIMUM_VERSION });
  }
  return undefined;
}

function claudeBareModelId(model?: string) {
  return normalizeClaudeModelId(model).split("[")[0] ?? "";
}

const ADAPTIVE_THINKING_ONLY_MODELS: ReadonlySet<string> = new Set([
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
]);

/**
 * Opus 5.5 and Sonnet 5.5 reject disabled and budget-based thinking. Haiku 5.5
 * rejects budget-based thinking, and disabled thinking at xhigh or max effort.
 * Stave keeps all three on adaptive thinking; effort sets the depth.
 */
export function claudeModelForcesAdaptiveThinking(model?: string) {
  return ADAPTIVE_THINKING_ONLY_MODELS.has(claudeBareModelId(model));
}

const MODELS_WITHOUT_FAST_MODE: ReadonlySet<string> = new Set([
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
]);

/**
 * Sonnet 5.5 and Haiku 5.5 have no fast mode. An unset model keeps the
 * caller's setting.
 */
export function claudeFastModeEnabled(requested?: boolean, model?: string) {
  return requested === true && !MODELS_WITHOUT_FAST_MODE.has(claudeBareModelId(model));
}
