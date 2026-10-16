import type { AgentRunAggregate, AgentRunEvent } from "./domain";
import { currentStageRecord } from "./domain";
import { AgentResourceRequestSchema, supportsAdaptiveEffort, type AdaptiveModelCatalog, type AdaptiveRunPolicy } from "./resources";
import { routeEffortOverrides } from "../routing/auto-routing";
import { getModelCapability, MODEL_TIER_ORDER } from "../providers/model-catalog";
import type { AgentRunRouteCause } from "../providers/provider.types";

/** Why a proposal did not become the route; the reply's route line names it. */
export type AdaptiveRouteCause = Exclude<AgentRunRouteCause, "request" | "route">;

/**
 * What the composer chose for a reply. A pin is the user's explicit choice: it
 * overrides the run's route, proposals and frozen pins until the composer
 * returns to Auto. The provider, account and permissions still cannot change.
 */
export interface ComposerRouteSelection {
  modelPinned: boolean;
  effortPinned: boolean;
  model?: string;
  effort?: string;
}

/** How the composer chose a reply's model and effort, with the values it sent. */
export interface AgentRunReplyComposer {
  /** `auto`: Auto routed it; `pinned`: the user chose it; `default`: neither (Auto off, no pin). */
  model: "auto" | "pinned" | "default";
  effortPinned: boolean;
  requestedModel?: string;
  requestedEffort?: string;
  rationale?: string;
}

/** The model a reply ran on when it is not the one the composer sent, and why. */
export interface AgentRunReplyRouteNote {
  model: string;
  cause: AgentRunRouteCause;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];

function tierRank(model: string) {
  const tier = getModelCapability({ model })?.tier;
  return tier ? MODEL_TIER_ORDER.indexOf(tier) : null;
}

/** A stronger model tier, or more effort on a tier at least as strong. An unknown tier never escalates. */
function escalates(model: string, effort: string | null, nextModel: string, nextEffort: string | null) {
  const before = tierRank(model), after = tierRank(nextModel);
  if (before === null || after === null || after < before) return false;
  if (after > before) return true;
  return nextEffort !== null && EFFORTS.indexOf(nextEffort) > (effort ? EFFORTS.indexOf(effort) : -1);
}

/**
 * A proposal is applied only at the next turn of its run (a supervised turn or
 * the user's reply), never in its tool call. Pass every `turn-linked` event of
 * the run: the cooldown counts the turns that ran on the current route, and a
 * reply runs on it as much as a supervised turn does.
 *
 * Priority: a composer pin, then the user's explicit request relayed by the
 * Agent, then a capability step-up, then any other change. The first three
 * skip the cooldown and the change limit; only the pin can leave the frozen
 * catalog or replace a frozen pin.
 */
export function selectAdaptiveRoute(policy: AdaptiveRunPolicy, aggregate: AgentRunAggregate, events: readonly AgentRunEvent[], catalog?: AdaptiveModelCatalog | null,
  automatic?: { model: string; effort?: string; rationale: string }, composer?: ComposerRouteSelection) {
  let model = policy.allowedModels[0]!, effort = policy.initialEffort;
  let changes = 0, lastChangeTurn = -policy.cooldownTurns, lastChangeLinked: number | null = null, appliedThrough = 0;
  let pin: { model: boolean; effort: boolean } | null = null;
  const stage = currentStageRecord(aggregate);
  const linkedTurnCount = events.filter((row) => row.kind === "turn-linked").length;
  const markChange = (detail: Record<string, unknown>) => {
    lastChangeTurn = Number(detail.turnCount);
    // Decisions saved before linked turns were recorded fall back to supervised turns.
    lastChangeLinked = typeof detail.linkedTurnCount === "number" ? detail.linkedTurnCount : null;
  };
  for (const event of events) {
    if (event.kind !== "resource-decision") continue;
    if (event.detail.source === "composer") {
      if (typeof event.detail.model !== "string") throw new Error("Invalid saved adaptive route.");
      model = event.detail.model;
      effort = typeof event.detail.effort === "string" ? event.detail.effort : null;
      pin = event.detail.modelPinned === true || event.detail.effortPinned === true
        ? { model: event.detail.modelPinned === true, effort: event.detail.effortPinned === true } : null;
      markChange(event.detail);
      continue;
    }
    if (event.detail.automatic !== true) appliedThrough = Math.max(appliedThrough, Number(event.detail.requestSequence));
    if (event.detail.accepted !== true) continue;
    if (typeof event.detail.model !== "string" || !policy.allowedModels.includes(event.detail.model)) throw new Error("Invalid saved adaptive route.");
    model = event.detail.model;
    effort = typeof event.detail.effort === "string" ? event.detail.effort : null;
    changes += 1;
    markChange(event.detail);
  }
  const base = { turnCount: aggregate.agentRun.turnCount, linkedTurnCount, stageId: stage.stageId, attempt: stage.attempt };

  let composerDecision: Record<string, unknown> | null = null, composerRefusal: string | null = null;
  if (composer?.modelPinned || composer?.effortPinned) {
    const pinModel = composer.modelPinned && composer.model ? composer.model : model;
    const normalized = routeEffortOverrides({ providerId: policy.providerId, model: pinModel, effort: (composer.effortPinned ? composer.effort : effort) ?? undefined });
    const pinEffort = normalized.claudeEffort ?? normalized.codexReasoningEffort ?? null;
    // The fresh account catalog decides when one is cached; otherwise only a model known to run elsewhere is refused,
    // since the composer offered it for this run's provider.
    const inCatalog = catalog ? catalog.some((entry) => entry.model === pinModel) : null;
    const runsHere = inCatalog ?? (policy.allowedModels.includes(pinModel) || (getModelCapability({ model: pinModel })?.providerId ?? policy.providerId) === policy.providerId);
    composerRefusal = !runsHere
      ? "The model pinned in the composer is not available to this run's provider and account. Choose another model, or switch the composer to Auto."
      : (composer.effortPinned && composer.effort && pinEffort !== composer.effort) || !supportsAdaptiveEffort(policy.providerId, pinModel, pinEffort, catalog)
        ? "The model pinned in the composer does not support the pinned effort. Choose a supported effort."
        : null;
    if (composerRefusal) return { model, effort, decision: null, composerDecision: null, composerRefusal, composerPin: pin, cause: null, requestSequence: null,
      runtimeOptions: routeEffortOverrides({ providerId: policy.providerId, model, effort: effort ?? undefined }) };
    const nextPin = { model: composer.modelPinned, effort: composer.effortPinned };
    if (pinModel !== model || pinEffort !== effort || pin?.model !== nextPin.model || pin?.effort !== nextPin.effort)
      composerDecision = { source: "composer", accepted: true, model: pinModel, effort: pinEffort, modelPinned: nextPin.model, effortPinned: nextPin.effort, ...base, reason: "composer-pin" };
    model = pinModel; effort = pinEffort; pin = nextPin;
  } else if (composer && pin) {
    // The composer is back on Auto, so the override ends: a model or effort the run froze at start
    // comes back, and anything else keeps this route and adapts from it again.
    const releasedModel = policy.modelLocked ? policy.allowedModels[0]! : model;
    const normalized = routeEffortOverrides({ providerId: policy.providerId, model: releasedModel, effort: (policy.effortLocked ? policy.initialEffort : effort) ?? undefined });
    const releasedEffort = normalized.claudeEffort ?? normalized.codexReasoningEffort ?? null;
    composerDecision = { source: "composer", accepted: true, model: releasedModel, effort: releasedEffort, modelPinned: false, effortPinned: false, ...base, reason: "composer-released" };
    model = releasedModel; effort = releasedEffort; pin = null;
  }
  // A pin decided on this reply starts the cooldown as a saved one would.
  if (composerDecision) { lastChangeTurn = base.turnCount; lastChangeLinked = linkedTurnCount; }
  const turnsOnRoute = lastChangeLinked === null ? aggregate.agentRun.turnCount - lastChangeTurn : linkedTurnCount - lastChangeLinked;

  const event = events.filter((row) => row.kind === "resource-request" && row.sequence > appliedThrough &&
    row.detail.stageId === stage.stageId && row.detail.attempt === stage.attempt).at(-1);
  let decision: Record<string, unknown> | null = null, cause: AdaptiveRouteCause | "request" | null = null;
  if (event || automatic) {
    const request = event ? AgentResourceRequestSchema.parse(event.detail.request)
      : { ...automatic!, ...(pin?.effort ? { effort: undefined } : {}), reason: "capability-mismatch" as const, evidenceRefs: [] as string[] };
    const nextModel = request.model ?? model;
    const beforeTier = getModelCapability({ model }), afterTier = getModelCapability({ model: nextModel });
    const linkedTurns = new Set(events.filter((row) => row.kind === "turn-linked" && row.detail.stageId === stage.stageId && row.detail.attempt === stage.attempt)
      .map((row) => row.detail.turnId));
    const evidenceValid = request.evidenceRefs.every((ref) => linkedTurns.has(ref));
    const normalized = routeEffortOverrides({ providerId: policy.providerId, model: nextModel, effort: request.effort ?? effort ?? undefined });
    const nextEffort = normalized.claudeEffort ?? normalized.codexReasoningEffort ?? null;
    // The user's explicit request and a step-up the work needs are not held back by the limits on discretionary changes.
    const unbounded = request.reason === "user-request" || (request.reason === "capability-mismatch" && escalates(model, effort, nextModel, nextEffort));
    const rejection: [AdaptiveRouteCause, string] | null = !evidenceValid ? ["evidence", "Evidence must name turns linked to this stage attempt."] :
      pin?.model && nextModel !== model ? ["composer-pin", "The model is pinned in the composer."] :
      pin?.effort && nextEffort !== effort ? ["composer-pin", "The effort is pinned in the composer."] :
      (!policy.allowedModels.includes(nextModel) || (catalog && !catalog.some((entry) => entry.model === nextModel))) ? ["catalog", "The model is outside this Run's same-provider eligible catalog."] :
      policy.modelLocked && nextModel !== model ? ["pinned", "The model is pinned."] :
      policy.effortLocked && nextEffort !== effort ? ["pinned", "The effort is pinned."] :
      (request.effort && nextEffort !== request.effort) ||
        !supportsAdaptiveEffort(policy.providerId, nextModel, nextEffort, catalog) ? ["effort", "The model does not support that effort."] :
      !unbounded && changes >= policy.maxChanges ? ["change-limit", "The change limit is reached."] :
      !unbounded && turnsOnRoute < policy.cooldownTurns ? ["cooldown", "The two-turn cooldown is active."] :
      request.reason === "mechanical-step" && nextEffort && (!effort || EFFORTS.indexOf(nextEffort) > EFFORTS.indexOf(effort)) ? ["mechanical", "A mechanical step cannot increase effort."] :
      request.reason === "mechanical-step" && (!beforeTier || !afterTier || MODEL_TIER_ORDER.indexOf(afterTier.tier) > MODEL_TIER_ORDER.indexOf(beforeTier.tier)) ? ["mechanical", "A mechanical step cannot increase model capability."] :
      nextModel === model && nextEffort === effort ? ["current", "This is already the current route."] : null;
    decision = { accepted: rejection === null, requestSequence: event?.sequence ?? null, ...(!event ? { automatic: true } : {}),
      model: rejection ? model : nextModel, effort: rejection ? effort : nextEffort, ...base,
      reason: rejection?.[1] ?? request.reason, rationale: request.rationale };
    if (!rejection) { model = nextModel; effort = nextEffort; }
    // An explicit request outranks the automatic proposal it replaced.
    cause = rejection?.[0] ?? (event && automatic ? "request" : null);
  }
  return { model, effort, decision, composerDecision, composerRefusal, composerPin: pin, cause, requestSequence: event?.sequence ?? null,
    runtimeOptions: routeEffortOverrides({ providerId: policy.providerId, model, effort: effort ?? undefined }) };
}
