/**
 * What a mission spent: the provider-reported usage of the turns it started,
 * summed. Claude reports a cost with each turn; Codex reports tokens only, so
 * cost stays null until at least one turn reported one.
 */

/** One turn's usage as the turns table stores it. */
export interface TurnUsageSample {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalCostUsd?: number;
}

export interface MissionUsage {
  /** Turns the mission started. */
  turns: number;
  /** Of those, the turns whose provider reported usage. */
  measuredTurns: number;
  inputTokens: number;
  outputTokens: number;
  /** Summed reported cost; null when no turn reported one. */
  costUsd: number | null;
}

export const EMPTY_MISSION_USAGE: MissionUsage = {
  turns: 0,
  measuredTurns: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: null,
};

export function sumTurnUsage(samples: ReadonlyArray<TurnUsageSample | null>): MissionUsage {
  let usage: MissionUsage = { ...EMPTY_MISSION_USAGE, turns: samples.length };
  for (const sample of samples) {
    if (!sample) continue;
    usage = {
      ...usage,
      measuredTurns: usage.measuredTurns + 1,
      // Cache reads are billed in the cost; counting them as tokens would dwarf the work.
      inputTokens: usage.inputTokens + sample.inputTokens,
      outputTokens: usage.outputTokens + sample.outputTokens,
      costUsd:
        typeof sample.totalCostUsd === "number" ? (usage.costUsd ?? 0) + sample.totalCostUsd : usage.costUsd,
    };
  }
  return usage;
}

/** Several missions' usage together, for a project. */
export function addMissionUsage(usages: ReadonlyArray<MissionUsage | null | undefined>): MissionUsage {
  return usages.reduce<MissionUsage>(
    (total, usage) =>
      usage
        ? {
            turns: total.turns + usage.turns,
            measuredTurns: total.measuredTurns + usage.measuredTurns,
            inputTokens: total.inputTokens + usage.inputTokens,
            outputTokens: total.outputTokens + usage.outputTokens,
            costUsd: usage.costUsd === null ? total.costUsd : (total.costUsd ?? 0) + usage.costUsd,
          }
        : total,
    EMPTY_MISSION_USAGE,
  );
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 100) / 10}k`.replace(".0k", "k");
  return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
}

export function formatCostUsd(cost: number): string {
  if (cost > 0 && cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

/**
 * The short form: `$1.24` when a cost was reported, otherwise `182k tokens`;
 * null before any turn reported usage.
 */
export function describeUsageShort(usage: MissionUsage | null | undefined): string | null {
  if (!usage || usage.measuredTurns === 0) return null;
  if (usage.costUsd !== null) return formatCostUsd(usage.costUsd);
  return `${formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens`;
}

/** The long form: `$1.24 · 182k tokens`, with a note when some turns reported nothing. */
export function describeUsageLong(usage: MissionUsage | null | undefined): string | null {
  if (!usage || usage.measuredTurns === 0) return null;
  const tokens = `${formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens`;
  const text = usage.costUsd !== null ? `${formatCostUsd(usage.costUsd)} · ${tokens}` : tokens;
  const unmeasured = usage.turns - usage.measuredTurns;
  return unmeasured > 0 ? `${text} (${unmeasured} ${unmeasured === 1 ? "turn" : "turns"} not reported)` : text;
}
