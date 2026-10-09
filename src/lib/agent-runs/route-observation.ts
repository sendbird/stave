import { z } from "zod";
import { buildAgentRunTurnOutcomeKey, type AgentRunEvent, type AgentRunStageRecord, type StageStatus } from "./domain";
import type { TurnUsageSample } from "./usage";

const RouteModelSchema = z.object({
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro"]),
  model: z.string().trim().min(1).max(200),
}).strict();

/** Selection facts only: neither a new execution policy nor native confirmation. */
export const AgentRunRouteSelectionSchema = z.object({
  version: z.literal(1),
  source: z.enum(["pinned", "agent-fixed", "task-model", "disabled", "manual", "heuristic", "classifier", "classifier_fallback", "adaptive"]),
  previous: RouteModelSchema,
  selected: RouteModelSchema,
  requestedEffort: z.string().trim().min(1).max(40).nullable(),
  effortSource: z.enum(["draft", "agent", "auto", "unspecified", "adaptive"]),
  inputs: z.object({
    quota: z.enum(["not-provided", "cached"]),
    catalog: z.enum(["not-provided", "frozen", "cached"]),
    availability: z.enum(["not-provided", "cached"]),
  }).strict(),
}).strict();
export type AgentRunRouteSelection = z.infer<typeof AgentRunRouteSelectionSchema>;

export interface AgentRunRouteTurnFacts {
  completed: boolean;
  ending: "completed" | "stopped" | "failed" | null;
  usage: TurnUsageSample | null;
}

export interface AgentRunRouteObservation {
  decisionId: string;
  turnId: string | null;
  stageId: string | null;
  attempt: number | null;
  selection: AgentRunRouteSelection | null;
  /** A requested provider change, not confirmation that native execution switched. */
  providerChanged: boolean | null;
  /** Routing alone confirms neither the effective model nor its effort. */
  effectiveModel: null;
  effectiveEffort: null;
  turnOutcome: "running" | "completed" | "stopped" | "failed" | "start-failed" | "interrupted" | "unknown";
  /** Current status shared by this attempt's decisions, not success attributed to this turn. */
  attemptStatus: StageStatus | null;
  /** Whether this is the latest dispatch decision in this exact attempt. */
  latestInAttempt: boolean | null;
  usage: TurnUsageSample | null;
  reportedCostUsd: number | null;
}

/**
 * Pure projection of existing keyed events. Missing/old evidence stays unknown.
 * Never associates a decision with a nearby turn or a newer stage attempt.
 */
export function projectAgentRunRoutes(args: {
  agentRunId: string;
  events: readonly AgentRunEvent[];
  stages: readonly AgentRunStageRecord[];
  turns?: ReadonlyMap<string, AgentRunRouteTurnFacts>;
}): AgentRunRouteObservation[] {
  const events = args.events.filter((event) => event.agentRunId === args.agentRunId)
    .slice().sort((left, right) => left.sequence - right.sequence);
  const keyed = new Map(events.filter((event) => event.idempotencyKey)
    .map((event) => [event.idempotencyKey!, event]));
  const seen = new Set<string>();
  const usedTurns = new Set<string>();
  const latestByAttempt = new Map<string, AgentRunRouteObservation>();
  const observations: AgentRunRouteObservation[] = [];
  for (const event of events) {
    if (event.kind !== "turn-started") continue;
    const decisionId = event.idempotencyKey ?? event.id;
    if (seen.has(decisionId)) continue;
    seen.add(decisionId);
    const stageId = typeof event.detail.stageId === "string" ? event.detail.stageId : null;
    const attempt = typeof event.detail.attempt === "number" && Number.isInteger(event.detail.attempt) && event.detail.attempt > 0
      ? event.detail.attempt : null;
    const outcomeEvent = (outcome: "linked" | "failed" | "interrupted") => {
      if (!event.idempotencyKey) return undefined;
      const candidate = keyed.get(buildAgentRunTurnOutcomeKey(event.idempotencyKey, outcome));
      return candidate && candidate.sequence > event.sequence && candidate.kind === `turn-${outcome}` &&
        candidate.detail.stageId === stageId && candidate.detail.attempt === attempt ? candidate : undefined;
    };
    const linked = outcomeEvent("linked");
    const candidateTurnId = typeof linked?.detail.turnId === "string" ? linked.detail.turnId : null;
    const turnId = candidateTurnId && !usedTurns.has(candidateTurnId) ? candidateTurnId : null;
    if (turnId) usedTurns.add(turnId);
    const facts = turnId ? args.turns?.get(turnId) : undefined;
    const selection = AgentRunRouteSelectionSchema.safeParse(event.detail.routeSelection);
    const stage = args.stages.find((record) => record.agentRunId === args.agentRunId && record.stageId === stageId && record.attempt === attempt);
    const usage = facts?.completed ? facts.usage : null;
    const observation: AgentRunRouteObservation = {
      decisionId, turnId, stageId, attempt,
      selection: selection.success ? selection.data : null,
      providerChanged: selection.success ? selection.data.previous.providerId !== selection.data.selected.providerId : null,
      effectiveModel: null, effectiveEffort: null,
      turnOutcome: outcomeEvent("interrupted") ? "interrupted" : outcomeEvent("failed") ? "start-failed"
        : facts ? facts.completed ? facts.ending ?? "unknown" : "running" : "unknown",
      attemptStatus: stage?.status ?? null,
      latestInAttempt: null,
      usage,
      reportedCostUsd: usage?.totalCostUsd ?? null,
    };
    if (stageId && attempt !== null) {
      const attemptKey = JSON.stringify([stageId, attempt]);
      const previous = latestByAttempt.get(attemptKey);
      if (previous) previous.latestInAttempt = false;
      observation.latestInAttempt = true;
      latestByAttempt.set(attemptKey, observation);
    }
    observations.push(observation);
  }
  return observations;
}
