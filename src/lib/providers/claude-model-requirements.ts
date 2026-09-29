/** Minimum verified by the provider's model-version rejection. */
export const CLAUDE_OPUS_55_MINIMUM_VERSION = "2.1.280";
/** Claude Code version that resolves the `sonnet` alias to Sonnet 5.5. */
export const CLAUDE_SONNET_55_MINIMUM_VERSION = "2.1.284";

export function getClaudeModelVersionGuidance(model: string): string | undefined {
  const trimmed = model.trim();
  if (/^claude-opus-5-5(?:\[1m\])?$/.test(trimmed)) {
    return `Requires Claude Code ${CLAUDE_OPUS_55_MINIMUM_VERSION} or newer. Run \`claude update\`, or update the Claude desktop app, then retry.`;
  }
  if (/^claude-sonnet-5-5(?:\[1m\])?$/.test(trimmed)) {
    return `Requires Claude Code ${CLAUDE_SONNET_55_MINIMUM_VERSION} or newer. Run \`claude update\`, or update the Claude desktop app, then retry.`;
  }
  return undefined;
}

function claudeBareModelId(model?: string) {
  return model?.split("[")[0] ?? "";
}

/** Opus 5.5 and Sonnet 5.5 reject disabled and budget-based thinking. */
export function claudeModelForcesAdaptiveThinking(model?: string) {
  const bareModel = claudeBareModelId(model);
  return bareModel === "claude-opus-5-5" || bareModel === "claude-sonnet-5-5";
}

/** Sonnet 5.5 has no fast mode. An unset model keeps the caller's setting. */
export function claudeFastModeEnabled(requested?: boolean, model?: string) {
  return requested === true && claudeBareModelId(model) !== "claude-sonnet-5-5";
}
