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
