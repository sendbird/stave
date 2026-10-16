import type {
  AutoRoutingModelResolution,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { RoutingDecisionObservation } from "@/lib/providers/routing-decision";
import {
  AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS,
  type AutoRoutingDecision,
  type AutoRoutingDecisionRecord,
  type AutoRoutingSignalSummary,
} from "@/lib/routing/auto-routing";
import type { ChatMessage } from "@/types/chat";

/**
 * What the Route block draws for one turn. Built either from the turn's saved
 * `modelResolution`, so a reloaded task draws the same route, or from the
 * decision the send still holds in memory when nothing was saved.
 */
export interface RouteTraceEntry {
  /** `recorded` reads the saved turn; `live` reads only the in-memory send. */
  origin: "recorded" | "live";
  promptPreview: string;
  providerId: ProviderId;
  model: string;
  effort: string | null;
  taskClass: string | null;
  source: AutoRoutingDecision["source"];
  confidence: number | null;
  ruleId: string | null;
  ruleReason: string | null;
  stance: string | null;
  /** Router inputs; only the in-memory decision keeps them. */
  signals: AutoRoutingSignalSummary | null;
  routingDecision?: RoutingDecisionObservation;
}

/** The first 120 characters, whitespace collapsed, as the in-memory record keeps them. */
export function toRoutePromptPreview(prompt: string): string {
  const preview = prompt.replace(/\s+/g, " ").trim();
  return preview.length > AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS
    ? `${preview.slice(0, AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS - 1)}…`
    : preview;
}

export function routeTraceEntryFromRecord(record: AutoRoutingDecisionRecord): RouteTraceEntry {
  const { decision } = record;
  return {
    origin: "live",
    promptPreview: record.promptPreview,
    providerId: decision.providerId,
    model: decision.model,
    effort: decision.claudeEffort ?? decision.codexReasoningEffort ?? null,
    taskClass: decision.taskClass,
    source: decision.source,
    confidence: decision.confidence,
    ruleId: decision.ruleId,
    ruleReason: decision.ruleReason || null,
    stance: decision.stance,
    signals: decision.signals,
    ...(decision.routingDecision ? { routingDecision: decision.routingDecision } : {}),
  };
}

/**
 * The saved decision for a turn. The in-memory record only adds the router
 * signals, and only when it is the same decision: the task keeps just its
 * latest send, which may belong to another turn.
 */
export function routeTraceEntryFromResolution(args: {
  resolution: AutoRoutingModelResolution;
  message: Pick<ChatMessage, "modelInfo">;
  prompt: string;
  live?: AutoRoutingDecisionRecord | null;
}): RouteTraceEntry {
  const { resolution } = args;
  const live = args.live && isSameDecision(args.live.decision, resolution) ? args.live : null;
  return {
    origin: "recorded",
    promptPreview: toRoutePromptPreview(args.prompt),
    providerId: resolution.selectedProviderId,
    model: resolution.selectedModel,
    effort: args.message.modelInfo?.effort ?? null,
    taskClass: resolution.taskClass ?? null,
    source: resolution.source,
    confidence: resolution.confidence,
    ruleId: resolution.ruleId ?? null,
    ruleReason: resolution.ruleReason || null,
    stance: resolution.stance ?? null,
    signals: live?.decision.signals ?? null,
    ...(resolution.routingDecision ? { routingDecision: resolution.routingDecision } : {}),
  };
}

function isSameDecision(decision: AutoRoutingDecision, resolution: AutoRoutingModelResolution) {
  return (
    decision.source === resolution.source &&
    decision.providerId === resolution.selectedProviderId &&
    decision.taskClass === resolution.taskClass &&
    (decision.ruleId ?? undefined) === resolution.ruleId &&
    decision.rationale === resolution.rationale
  );
}
