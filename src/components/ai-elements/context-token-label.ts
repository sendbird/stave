import { formatTokenCount } from "@/i18n/format";

export function contextTokenLabel(usage: { usedTokens?: number; windowTokens?: number }): string | null {
  if (usage.usedTokens === undefined || usage.windowTokens === undefined) return null;
  return `${formatTokenCount(usage.usedTokens)} / ${formatTokenCount(usage.windowTokens)}`;
}
