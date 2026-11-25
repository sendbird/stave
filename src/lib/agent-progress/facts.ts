import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { i18n } from "@/i18n/runtime";
import { formatCost, formatDuration, formatTokenCount } from "@/i18n/format";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import type { AgentProgressFacts } from "./agent-progress.types";

/** States an agent can no longer leave; every other state still moves. */
const SETTLED_STATES: ReadonlySet<WorkState> = new Set(["ready", "failed", "stopped", "skipped", "unknown"]);

export function isAgentStateLive(state: WorkState): boolean {
  return !SETTLED_STATES.has(state);
}

/**
 * How long the agent has worked. It counts to `nowMs` while live and stops at
 * `endedAt` once settled, so a finished agent's time never grows. Without an
 * observed start, the provider's measured `elapsedMs` is used, or nothing.
 */
export function resolveAgentElapsedMs(
  facts: Pick<AgentProgressFacts, "startedAt" | "endedAt" | "elapsedMs">,
  options: { nowMs: number; live: boolean },
): number | null {
  if (facts.startedAt === undefined) return facts.elapsedMs ?? null;
  const end = options.live
    ? Math.max(options.nowMs, facts.startedAt)
    : facts.endedAt ?? (facts.elapsedMs !== undefined ? facts.startedAt + facts.elapsedMs : undefined);
  if (end === undefined) return null;
  return Math.max(0, end - facts.startedAt);
}

export type AgentFactKey = "kind" | "model" | "effort" | "elapsed" | "steps" | "context" | "spend";

export interface AgentFact {
  key: AgentFactKey;
  text: string;
}

/** Spend as the shortest true figure: the cost, else the tokens it read and wrote. */
function formatSpend(spend: NonNullable<AgentProgressFacts["spend"]>): string | null {
  if (spend.totalCostUsd !== undefined && spend.totalCostUsd > 0) {
    return formatCost(spend.totalCostUsd, "USD");
  }
  const input = spend.inputTokens ?? 0;
  const output = spend.outputTokens ?? 0;
  if (input + output <= 0) return null;
  return i18n.t("session:agentProgress.facts.tokens", {
    input: formatTokenCount(input),
    output: formatTokenCount(output),
  });
}

/**
 * The fact row every agent surface shows, always in this order: kind · model ·
 * effort · elapsed · steps · context or spend. Each fact is left out when it is
 * unknown; nothing is estimated.
 */
export function formatAgentFacts(
  args: { kindLabel?: string; facts: AgentProgressFacts },
  options: { nowMs: number; live: boolean },
): AgentFact[] {
  const { facts } = args;
  const out: AgentFact[] = [];
  if (args.kindLabel?.trim()) out.push({ key: "kind", text: args.kindLabel.trim() });
  if (facts.model?.trim()) out.push({ key: "model", text: toHumanModelName({ model: facts.model.trim() }) });
  if (facts.effort?.trim()) out.push({ key: "effort", text: facts.effort.trim() });
  const elapsed = resolveAgentElapsedMs(facts, options);
  if (elapsed !== null) out.push({ key: "elapsed", text: formatDuration(elapsed) });
  if (facts.steps > 0) {
    out.push({ key: "steps", text: i18n.t("session:agentProgress.facts.steps", { count: facts.steps }) });
  }
  if (facts.contextTokens !== undefined && facts.contextTokens > 0) {
    out.push({
      key: "context",
      text: i18n.t("session:agentProgress.facts.context", { value: formatTokenCount(facts.contextTokens) }),
    });
  } else if (facts.spend) {
    const spend = formatSpend(facts.spend);
    if (spend) out.push({ key: "spend", text: spend });
  }
  return out;
}

/** The fact row as one line: `Explore · Opus 4.5 · high · 2m 14s · 18 steps`. */
export function formatAgentFactLine(
  args: { kindLabel?: string; facts: AgentProgressFacts },
  options: { nowMs: number; live: boolean },
): string {
  return formatAgentFacts(args, options).map((fact) => fact.text).join(" · ");
}
