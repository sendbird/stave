import { i18n } from "@/i18n/runtime";
import { isDelegationExchangeLive, type DelegationExchange } from "@/lib/delegation/exchange";
import type { ExchangeStatus } from "@/lib/delegation/format";
import { exchangeStatusToWorkState } from "@/lib/delegation/format";
import type {
  AgentProgress,
  AgentProgressParent,
  AgentProgressSource,
  AgentStep,
} from "./agent-progress.types";
import { textStep } from "./step-builders";
import { countWorkSteps, findCurrentStep, sortAgentSteps } from "./steps";

/**
 * A delegation exchange (a delegated task, a review or an in-turn subagent)
 * and the steps read for it, as the shared progress model. The exchange
 * carries the state, identity and timing every delegation surface already
 * agrees on; the steps come from the task's messages or the provider history.
 */
export function progressFromExchange(
  exchange: DelegationExchange,
  args: {
    steps: readonly AgentStep[];
    source?: AgentProgressSource;
    /** A fuller ask than the exchange's (the prompt, not its summary). */
    ask?: string;
    /** The answer read from the transcript; the exchange may hold a cut copy. */
    result?: string;
    kindLabel?: string;
    parent?: AgentProgressParent;
    readOnly?: boolean;
    /** Model and effort a provider history reported, when the exchange has none. */
    model?: string;
    effort?: string;
    contextTokens?: number;
  },
): AgentProgress {
  const live = isDelegationExchangeLive(exchange);
  const steps = sortAgentSteps(args.steps);
  const { timing, identity, outcome } = exchange;
  const observed = timing.observed !== false;
  const reported = outcome.progress?.at(-1)?.trim();
  const now = live
    ? findCurrentStep(steps) ??
      (reported ? textStep({ id: `${exchange.id}:now`, kind: "note", text: reported, status: "running" }) : undefined)
    : undefined;
  const model = identity.model ?? args.model;
  const effort = identity.effort ?? args.effort;
  // A work-graph title leads with the agent type (`Explore · …`); the fact row already says it.
  const kindPrefix = args.kindLabel ? `${args.kindLabel} · ` : null;
  const title = kindPrefix && exchange.title.startsWith(kindPrefix) && exchange.title.length > kindPrefix.length
    ? exchange.title.slice(kindPrefix.length)
    : exchange.title;
  return {
    id: exchange.id,
    source: args.source ?? (exchange.kind === "subagent" ? "subagent" : "delegated-task"),
    title,
    ...(args.kindLabel ? { kindLabel: args.kindLabel } : {}),
    ...(args.parent ? { parent: args.parent } : {}),
    state: exchangeStatusToWorkState(outcome.status),
    facts: {
      ...(identity.providerId ? { providerId: identity.providerId } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(observed && timing.startedAt !== null ? { startedAt: timing.startedAt } : {}),
      ...(observed && timing.endedAt !== undefined ? { endedAt: timing.endedAt } : {}),
      ...(timing.elapsedMs !== undefined ? { elapsedMs: timing.elapsedMs } : {}),
      steps: countWorkSteps(steps),
      ...(args.contextTokens !== undefined ? { contextTokens: args.contextTokens } : {}),
      ...(outcome.spend ? { spend: outcome.spend } : {}),
    },
    ...(now ? { now } : {}),
    ask: args.ask?.trim() ? args.ask : exchange.ask,
    ...((args.result ?? outcome.result) ? { result: args.result ?? outcome.result } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
    steps,
    readOnly: args.readOnly ?? false,
  };
}

const STEP_EXCHANGE_STATUS: Record<AgentStep["status"], ExchangeStatus> = {
  running: "running",
  done: "returned",
  error: "failed",
};

/**
 * A subagent known only from the step that started it (a nested agent read
 * from a saved transcript): its header until a richer source lists it.
 */
export function exchangeFromSubagentStep(step: AgentStep): DelegationExchange {
  const child = step.child;
  const title = child?.title ?? step.done;
  const output = step.detail?.output?.trim();
  const status = STEP_EXCHANGE_STATUS[step.status];
  return {
    id: step.childId ?? `subagent:${step.id}`,
    kind: child?.kind === "delegated-task" ? "delegated-task" : "subagent",
    title,
    identity: {
      role: i18n.t("session:agentProgress.panel.kindSubagent"),
      ...(child?.kind === "subagent" && child.providerId ? { providerId: child.providerId } : {}),
    },
    ask: step.text ?? title,
    outcome: {
      status,
      ...(output && status === "returned" ? { result: output } : {}),
      ...(output && status === "failed" ? { error: output } : {}),
    },
    timing: {
      startedAt: step.startedAt ?? null,
      stages: [],
      ...(step.durationMs !== undefined ? { observed: false as const, elapsedMs: step.durationMs } : {}),
    },
    actions: [],
    setup: {},
    ref: {
      ...(child?.kind === "subagent" && child.toolUseId ? { toolUseId: child.toolUseId } : {}),
      ...(child?.kind === "subagent" && child.agentId ? { agentId: child.agentId } : {}),
    },
  };
}
