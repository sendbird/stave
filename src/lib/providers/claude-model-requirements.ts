/** Minimum verified by the provider's model-version rejection. */
export const CLAUDE_OPUS_55_MINIMUM_VERSION = "2.1.280";

export function getClaudeModelVersionGuidance(model: string): string | undefined {
  if (!/^claude-opus-5-5(?:\[1m\])?$/.test(model.trim())) return undefined;
  return `Requires Claude Code ${CLAUDE_OPUS_55_MINIMUM_VERSION} or newer. Run \`claude update\`, or update the Claude desktop app, then retry.`;
}
