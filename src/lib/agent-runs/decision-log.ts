import { i18n } from "@/i18n/runtime";
import type { I18nKey } from "@/i18n/runtime";
import { describeAgentIdentity } from "../delegation/format";
import type { ProviderId } from "../providers/provider.types";
import { RoutingDecisionObservationSchema } from "../providers/routing-decision";
import { describeRoutingDecisionFacts } from "../providers/routing-decision-label";
import { toAgentRunAccountSwitch, describeAgentRunAccountSwitch } from "./account-pool";
import { describeAgentRunStageName } from "./agent-run-view";
import type { AgentRun, AgentRunEvent } from "./domain";
import { describeEventWaitEvent } from "./event-wait";
import { AgentRunRouteSelectionSchema, type AgentRunRouteSelection } from "./route-observation";

export type AgentRunDecisionKind = "route" | "resource" | "account" | "wait" | "retry";

export interface AgentRunDecisionLogEntry {
  id: string;
  kind: AgentRunDecisionKind;
  at: string;
  text: string;
  /** Why, from the record: the route source and decision facts, or a change's reason. */
  detail: string | null;
  /** Bounded free text the record kept (a route rationale), for a hover title. */
  note: string | null;
  /** A declined change or an ended wait: something the reader may want to act on. */
  attention: boolean;
}

const SOURCE_KEYS = {
  pinned: "agentRuns:decisionLog.sources.pinned",
  "agent-fixed": "agentRuns:decisionLog.sources.agentFixed",
  "task-model": "agentRuns:decisionLog.sources.taskModel",
  disabled: "agentRuns:decisionLog.sources.disabled",
  manual: "agentRuns:decisionLog.sources.manual",
  heuristic: "agentRuns:decisionLog.sources.heuristic",
  classifier: "agentRuns:decisionLog.sources.classifier",
  classifier_fallback: "agentRuns:decisionLog.sources.classifierFallback",
  adaptive: "agentRuns:decisionLog.sources.adaptive",
} as const satisfies Record<AgentRunRouteSelection["source"], I18nKey>;

const CHANGE_REASON_KEYS = {
  "capability-mismatch": "agentRuns:decisionLog.changeReasons.capabilityMismatch",
  "mechanical-step": "agentRuns:decisionLog.changeReasons.mechanicalStep",
} as const satisfies Record<string, I18nKey>;

/** The declined-change sentences `selectAdaptiveRoute` records, matched exactly. */
const DECLINED_REASON_KEYS = {
  "Evidence must name turns linked to this stage attempt.": "agentRuns:decisionLog.declined.evidence",
  "The model is outside this Run's same-provider eligible catalog.": "agentRuns:decisionLog.declined.outsideCatalog",
  "The model is pinned.": "agentRuns:decisionLog.declined.modelPinned",
  "The effort is pinned.": "agentRuns:decisionLog.declined.effortPinned",
  "The model does not support that effort.": "agentRuns:decisionLog.declined.unsupportedEffort",
  "The change limit is reached.": "agentRuns:decisionLog.declined.changeLimit",
  "The two-turn cooldown is active.": "agentRuns:decisionLog.declined.cooldown",
  "A mechanical step cannot increase effort.": "agentRuns:decisionLog.declined.mechanicalEffort",
  "A mechanical step cannot increase model capability.": "agentRuns:decisionLog.declined.mechanicalModel",
  "This is already the current route.": "agentRuns:decisionLog.declined.alreadyCurrent",
} as const satisfies Record<string, I18nKey>;

function lookup<T extends Record<string, I18nKey>>(map: T, key: string): T[keyof T] | undefined {
  return Object.hasOwn(map, key) ? map[key as keyof T] : undefined;
}

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>(["claude-code", "codex", "cursor", "kiro", "opencode"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routeLabel(providerId: unknown, model: unknown, effort: unknown) {
  return describeAgentIdentity({
    providerId: typeof providerId === "string" && PROVIDER_IDS.has(providerId) ? (providerId as ProviderId) : null,
    model: text(model),
    effort: text(effort),
  }).text;
}

function withStage(agentRun: AgentRun, event: AgentRunEvent, sentence: string) {
  if (agentRun.workflow.stages.length <= 1) return sentence;
  const stage = typeof event.detail.stageId === "string"
    ? describeAgentRunStageName(agentRun, event.detail.stageId, Number(event.detail.attempt ?? 1))
    : null;
  return stage ? i18n.t("agentRuns:decisionLog.inStage", { stage, sentence }) : sentence;
}

function describeRoute(agentRun: AgentRun, event: AgentRunEvent): AgentRunDecisionLogEntry {
  const selection = AgentRunRouteSelectionSchema.safeParse(event.detail.routeSelection);
  const fingerprint = event.detail.fingerprint as { providerId?: unknown; model?: unknown } | undefined;
  const selected = selection.success
    ? routeLabel(selection.data.selected.providerId, selection.data.selected.model, selection.data.requestedEffort)
    : routeLabel(fingerprint?.providerId, fingerprint?.model, null);
  const previous = selection.success &&
    (selection.data.previous.providerId !== selection.data.selected.providerId || selection.data.previous.model !== selection.data.selected.model)
    ? routeLabel(selection.data.previous.providerId, selection.data.previous.model, null)
    : null;
  const decision = RoutingDecisionObservationSchema.safeParse(event.detail.routingDecision);
  const detail = [
    selection.success ? i18n.t(SOURCE_KEYS[selection.data.source]) : null,
    ...(decision.success
      ? describeRoutingDecisionFacts(decision.data).map((fact) => i18n.t("agentRuns:decisionLog.fact", { label: fact.label, value: fact.value }))
      : []),
  ].filter(Boolean).join(" · ");
  const sentence = previous
    ? i18n.t("agentRuns:decisionLog.routedChanged", { previous, model: selected })
    : i18n.t("agentRuns:decisionLog.routed", { model: selected });
  return {
    id: event.id, kind: "route", at: event.createdAt,
    text: withStage(agentRun, event, sentence),
    detail: detail || null,
    note: text(event.detail.rationale),
    attention: decision.success && Boolean(decision.data.failure && decision.data.preferred.mode === "gateway" && decision.data.failure !== "unavailable"),
  };
}

function describeResourceDecision(agentRun: AgentRun, event: AgentRunEvent): AgentRunDecisionLogEntry {
  const accepted = event.detail.accepted === true;
  const route = routeLabel(agentRun.fingerprint.providerId, event.detail.model, event.detail.effort);
  const reason = text(event.detail.reason);
  const by = event.detail.automatic === true
    ? i18n.t("agentRuns:decisionLog.byStave")
    : i18n.t("agentRuns:decisionLog.byAgent");
  const reasonKey = !reason ? undefined
    : accepted ? lookup(CHANGE_REASON_KEYS, reason) : lookup(DECLINED_REASON_KEYS, reason);
  // An unrecognised reason is Stave's own recorded sentence; show it as written.
  const why = reasonKey ? i18n.t(reasonKey) : reason;
  return {
    id: event.id, kind: "resource", at: event.createdAt,
    text: withStage(agentRun, event, accepted
      ? i18n.t("agentRuns:decisionLog.changed", { model: route })
      : i18n.t("agentRuns:decisionLog.kept", { model: route })),
    detail: [by, why].filter(Boolean).join(" · "),
    note: text(event.detail.rationale),
    attention: !accepted,
  };
}

/**
 * What the run decided on its own, oldest first: the route of each turn, an
 * adaptive model or effort change (taken or declined), an account switch, a
 * wait for an outside event, and a stage retry. Reads recorded events only;
 * an event it cannot read is left out rather than guessed.
 */
export function projectAgentRunDecisionLog(detail: { agentRun: AgentRun; events: readonly AgentRunEvent[] }): AgentRunDecisionLogEntry[] {
  const { agentRun } = detail;
  const events = detail.events.filter((event) => event.agentRunId === agentRun.id)
    .slice().sort((left, right) => left.sequence - right.sequence);
  const entries: AgentRunDecisionLogEntry[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "turn-started":
        entries.push(describeRoute(agentRun, event));
        break;
      case "resource-decision":
        entries.push(describeResourceDecision(agentRun, event));
        break;
      case "account-switched": {
        const change = toAgentRunAccountSwitch(event);
        if (change) entries.push({ id: event.id, kind: "account", at: event.createdAt, text: describeAgentRunAccountSwitch(change), detail: null, note: null, attention: false });
        break;
      }
      case "wait-registered":
      case "wait-woke":
      case "wait-expired": {
        const line = describeEventWaitEvent(event);
        if (line) entries.push({ id: event.id, kind: "wait", at: line.at, text: line.text, detail: null, note: null, attention: event.kind === "wait-expired" });
        break;
      }
      case "stage-retried": {
        const stage = typeof event.detail.stageId === "string"
          ? describeAgentRunStageName(agentRun, event.detail.stageId, Number(event.detail.attempt ?? 1))
          : null;
        entries.push({
          id: event.id, kind: "retry", at: event.createdAt,
          text: stage ? i18n.t("agentRuns:remaining.presentationCopy418", { v1: stage }) : i18n.t("agentRuns:decisionLog.retried"),
          detail: null, note: null, attention: false,
        });
        break;
      }
      default:
        break;
    }
  }
  return entries;
}
