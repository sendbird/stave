import type { AgentRunAggregate, AgentRunEvent } from "./domain";
import { currentStageRecord } from "./domain";
import { AgentResourceRequestSchema, supportsAdaptiveEffort, type AdaptiveModelCatalog, type AdaptiveRunPolicy } from "./resources";
import { routeEffortOverrides } from "../routing/auto-routing";
import { getModelCapability, MODEL_TIER_ORDER } from "../providers/model-catalog";

/** A proposal is applied only at the next supervised turn, never in its tool call. */
export function selectAdaptiveRoute(policy: AdaptiveRunPolicy, aggregate: AgentRunAggregate, events: readonly AgentRunEvent[], catalog?: AdaptiveModelCatalog | null) {
  let model = policy.allowedModels[0]!, effort = policy.initialEffort;
  let changes = 0, lastChangeTurn = -policy.cooldownTurns, appliedThrough = 0;
  const stage = currentStageRecord(aggregate);
  for (const event of events) {
    if (event.kind !== "resource-decision") continue;
    appliedThrough = Math.max(appliedThrough, Number(event.detail.requestSequence));
    if (event.detail.accepted !== true) continue;
    if (typeof event.detail.model !== "string" || !policy.allowedModels.includes(event.detail.model)) throw new Error("Invalid saved adaptive route.");
    model = event.detail.model;
    effort = typeof event.detail.effort === "string" ? event.detail.effort : null;
    changes += 1;
    lastChangeTurn = Number(event.detail.turnCount);
    appliedThrough = Math.max(appliedThrough, Number(event.detail.requestSequence));
  }
  const event = events.filter((row) => row.kind === "resource-request" && row.sequence > appliedThrough &&
    row.detail.stageId === stage.stageId && row.detail.attempt === stage.attempt).at(-1);
  let decision: Record<string, unknown> | null = null;
  if (event) {
    const request = AgentResourceRequestSchema.parse(event.detail.request);
    const nextModel = request.model ?? model;
    const beforeTier = getModelCapability({ model }), afterTier = getModelCapability({ model: nextModel });
    const linkedTurns = new Set(events.filter((row) => row.kind === "turn-linked" && row.detail.stageId === stage.stageId && row.detail.attempt === stage.attempt)
      .map((row) => row.detail.turnId));
    const evidenceValid = request.evidenceRefs.every((ref) => linkedTurns.has(ref));
    const normalized = routeEffortOverrides({ providerId: policy.providerId, model: nextModel, effort: request.effort ?? effort ?? undefined });
    const nextEffort = normalized.claudeEffort ?? normalized.codexReasoningEffort ?? null;
    const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
    const rejection = !evidenceValid ? "Evidence must name turns linked to this stage attempt." :
      (!policy.allowedModels.includes(nextModel) || (catalog && !catalog.some((entry) => entry.model === nextModel))) ? "The model is outside this Run's same-provider eligible catalog." :
      policy.modelLocked && nextModel !== model ? "The model is pinned." :
      policy.effortLocked && nextEffort !== effort ? "The effort is pinned." :
      (request.effort && nextEffort !== request.effort) ||
        !supportsAdaptiveEffort(policy.providerId, nextModel, nextEffort, catalog) ? "The model does not support that effort." :
      changes >= policy.maxChanges ? "The change limit is reached." :
      aggregate.agentRun.turnCount - lastChangeTurn < policy.cooldownTurns ? "The two-turn cooldown is active." :
      request.reason === "mechanical-step" && nextEffort && (!effort || efforts.indexOf(nextEffort) > efforts.indexOf(effort)) ? "A mechanical step cannot increase effort." :
      request.reason === "mechanical-step" && (!beforeTier || !afterTier || MODEL_TIER_ORDER.indexOf(afterTier.tier) > MODEL_TIER_ORDER.indexOf(beforeTier.tier)) ? "A mechanical step cannot increase model capability." :
      nextModel === model && nextEffort === effort ? "This is already the current route." : null;
    decision = { accepted: rejection === null, requestSequence: event.sequence,
      model: rejection ? model : nextModel, effort: rejection ? effort : nextEffort,
      turnCount: aggregate.agentRun.turnCount, stageId: stage.stageId, attempt: stage.attempt,
      reason: rejection ?? request.reason, rationale: request.rationale };
    if (!rejection) { model = nextModel; effort = nextEffort; }
  }
  return { model, effort, decision, requestSequence: event?.sequence ?? null,
    runtimeOptions: routeEffortOverrides({ providerId: policy.providerId, model, effort: effort ?? undefined }) };
}
