import { i18n } from "@/i18n/runtime";
import type {
  AgentFleetAgent,
  AgentFleetStep,
} from "@/components/ads/components/AgentFleet.model";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import {
  isDelegationExchangeLive,
  resolveExchangeElapsedMs,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { describeAgentIdentity, describeExchangeStatus, type ExchangeStatus } from "@/lib/delegation/format";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { toToolDisplayName } from "@/lib/tool-display-name";
import type { ChatMessage } from "@/types/chat";
import { FLEET_ATTENTION_KIND_LABEL } from "./fleet-vocabulary";
import { sameData } from "./attention-sharing";
import { buildTaskActivityLine } from "./task-activity-line";
import { isFleetAnswerNeed, type FleetTaskRow } from "./task-rows";
import type { FleetDisplayStatus } from "./task-status";

/**
 * Fleet's tasks and their subagents in the vocabulary of the `AgentFleet`
 * tree: one main agent per open task, one subagent per delegation exchange.
 * Pure, so the container only wires store reads to these functions.
 */

type AgentStatus = Pick<AgentFleetAgent, "status" | "statusLabel">;

/**
 * A task's Fleet status as a main agent's. A quiet turn is still running and
 * says so in the board's own words ("No updates"); a request waiting on the
 * user reads "Needs you"; a status Fleet cannot know (a workspace nobody
 * opened) is queued and says "Unknown" rather than guessing.
 */
export function mapFleetTaskStatus(status: FleetDisplayStatus): AgentStatus {
  switch (status) {
    case "running":
      return { status: "running" };
    case "stalled":
      return { status: "running", statusLabel: FLEET_ATTENTION_KIND_LABEL["turn-stalled"] };
    case "waiting-input":
    case "waiting-approval":
      return { status: "waiting", statusLabel: WORK_STATE["needs-you"].label };
    case "error":
      return { status: "failed" };
    case "idle":
      return { status: "done" };
    case "unknown":
      return { status: "queued", statusLabel: WORK_STATE.unknown.label };
  }
}

/**
 * A task row's status as a main agent's. A task in a workspace nobody opened
 * has no status of its own, but a pending request for it (an approval, a
 * question, a sign-off) still says it waits on the user.
 */
export function mapFleetTaskRowStatus(row: Pick<FleetTaskRow, "status" | "need">): AgentStatus {
  if (row.status === "unknown" && isFleetAnswerNeed(row.need)) {
    return mapFleetTaskStatus("waiting-input");
  }
  return mapFleetTaskStatus(row.status);
}

/**
 * A delegation's status as a subagent's: the one place the exchange
 * vocabulary meets the tree's. `needs_user` is the only status that waits on
 * the user; a delegate between turns on its own still reads as working. The
 * settled ends that are not plain failures (cancelled, timed out,
 * unresolved) keep their own words.
 */
export function mapExchangeStatus(
  exchange: Pick<DelegationExchange, "outcome">,
): AgentStatus {
  const status: ExchangeStatus = exchange.outcome.status;
  switch (status) {
    case "queued":
      return { status: "queued" };
    case "running":
      return { status: "running" };
    // Live but between turns on its own (an event, a usage reset): still
    // working, so it does not count as needing the user.
    case "waiting":
      return { status: "running", statusLabel: describeExchangeStatus("waiting").label };
    case "needs_user":
      return { status: "waiting" };
    case "returned":
      return { status: "done" };
    case "failed":
      return { status: "failed" };
    case "timed_out":
      return { status: "failed", statusLabel: describeExchangeStatus("timed_out").label };
    case "cancelled":
    case "unresolved":
      return { status: "stopped", statusLabel: describeExchangeStatus(status).label };
    default: {
      const unhandled: never = status;
      void unhandled;
      return { status: "queued", statusLabel: WORK_STATE.unknown.label };
    }
  }
}

// Sums by the messages array they were read from: a streamed chunk replaces
// only its own task's array, so every other task's sum is reused.
const costCache = new WeakMap<readonly ChatMessage[], number | null>();

/**
 * The task's cost as its messages reported it, summed; null when no message
 * reported one, so an unknown cost is never shown as $0.
 */
export function sumReportedCostUsd(messages: readonly ChatMessage[] | undefined): number | null {
  if (!messages) return null;
  const cached = costCache.get(messages);
  if (cached !== undefined) return cached;
  let total: number | null = null;
  for (const message of messages) {
    const cost = message.usage?.totalCostUsd;
    if (typeof cost === "number" && Number.isFinite(cost)) total = (total ?? 0) + cost;
  }
  costCache.set(messages, total);
  return total;
}

/** The latest model an assistant message of the task named, if any. */
export function latestReportedModel(messages: readonly ChatMessage[] | undefined): string | null {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.model && message.model !== "user") return message.model;
  }
  return null;
}

/** Distinct tool names of the turn's work items, most recently updated first. */
export function collectRecentToolNames(
  activity: Pick<ProviderTurnActivitySnapshot, "orderedWorkItemIds" | "workItemsById"> | null | undefined,
  max = 8,
): string[] {
  if (!activity) return [];
  const tools = activity.orderedWorkItemIds
    .map((id) => activity.workItemsById[id])
    .filter((item) => item?.kind === "tool")
    .sort((left, right) => right!.updatedAt - left!.updatedAt);
  const names: string[] = [];
  for (const item of tools) {
    const name = (item!.toolName ?? item!.title).trim();
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= max) break;
  }
  return names;
}

/** What a main card reads from the running turn and the task's messages. */
export interface FleetAgentFacts {
  /** "Edit file · src/search.ts", the turn's latest reported work. */
  activity: string | null;
  tools: readonly string[];
  /** The live turn's start; absent once no turn runs. */
  startedAt: number | null;
  cost: number | null;
  model: string | null;
}

export const EMPTY_FLEET_AGENT_FACTS: FleetAgentFacts = {
  activity: null,
  tools: [],
  startedAt: null,
  cost: null,
  model: null,
};

function withDetail(label: string, detail: string | null | undefined) {
  return detail ? i18n.t("fleet:taskActivity.withDetail", { label, detail }) : label;
}

/**
 * The facts of one row. No relative time goes in: the card's running time
 * ticks on its own, so the line only changes when the turn reports new work.
 */
export function buildFleetAgentFacts(args: {
  activity: ProviderTurnActivitySnapshot | null;
  messages: readonly ChatMessage[] | undefined;
}): FleetAgentFacts {
  const line = buildTaskActivityLine({ activity: args.activity, now: args.activity?.lastEventAt ?? 0 });
  const cost = sumReportedCostUsd(args.messages);
  const model = latestReportedModel(args.messages);
  const tools = collectRecentToolNames(args.activity);
  if (!line && cost === null && model === null && tools.length === 0) return EMPTY_FLEET_AGENT_FACTS;
  return {
    activity: line?.last ? withDetail(line.last.label, line.last.detail) : null,
    tools,
    startedAt: args.activity && args.activity.completedAt == null ? args.activity.startedAt : null,
    cost,
    model,
  };
}

/**
 * `next` with each entry equal to `previous`'s kept as it was, and `previous`
 * itself when nothing changed: a streamed chunk that reports no new work
 * leaves the tree's agents (and its cards) alone.
 */
export function shareFleetAgentFacts(
  previous: Readonly<Record<string, FleetAgentFacts>>,
  next: Record<string, FleetAgentFacts>,
): Readonly<Record<string, FleetAgentFacts>> {
  let changed = Object.keys(previous).length !== Object.keys(next).length;
  for (const [key, facts] of Object.entries(next)) {
    const before = previous[key];
    if (before && sameData(before, facts, 2)) next[key] = before;
    else changed = true;
  }
  return changed ? next : previous;
}

/**
 * One open task as a main agent: its title, who runs it, its latest work (or
 * what it needs from you, or where it lives), its tools, live start and cost.
 * The avatar is the host's to add.
 */
export function buildMainAgent(row: FleetTaskRow, facts: FleetAgentFacts): AgentFleetAgent {
  const identity = describeAgentIdentity({ providerId: row.task.provider, model: facts.model });
  const need = row.need
    ? withDetail(FLEET_ATTENTION_KIND_LABEL[row.need.kind], row.need.detail?.trim() || null)
    : null;
  return {
    id: row.key,
    name: row.task.title || i18n.t("fleet:fleetWorkspaceCard.untitledTask"),
    model: identity.text,
    task: facts.activity ?? need ?? row.workspaceName,
    tools: facts.tools.map((tool) => ({ id: tool, name: toToolDisplayName(tool) })),
    ...mapFleetTaskRowStatus(row),
    ...(facts.cost !== null ? { cost: facts.cost } : {}),
    ...(facts.startedAt !== null && row.activeTurnId ? { startedAt: facts.startedAt } : {}),
  };
}

function exchangeSteps(exchange: DelegationExchange): AgentFleetStep[] {
  const stages = exchange.timing.stages;
  if (stages.length > 0) {
    return stages.map((stage, index) => {
      const next = stages[index + 1];
      return {
        id: `${exchange.id}:stage:${index}`,
        title: stage.label,
        ...(stage.detail ? { tool: stage.detail } : {}),
        ...(next ? { tookMs: Math.max(0, next.at - stage.at) } : {}),
      };
    });
  }
  return (exchange.outcome.progress ?? []).map((title, index) => ({
    id: `${exchange.id}:progress:${index}`,
    title,
  }));
}

/**
 * One delegation as a subagent. A delegated task opens as its own task, so
 * only an in-turn subagent lists its steps; the resolve shortcut ("Answer"
 * while it waits, "Open" after it failed) exists only where there is a task
 * to open.
 */
export function buildSubagent(exchange: DelegationExchange, nowMs: number): AgentFleetAgent {
  const status = mapExchangeStatus(exchange);
  const live = isDelegationExchangeLive(exchange);
  const elapsedMs = resolveExchangeElapsedMs(exchange, nowMs);
  const cost = exchange.outcome.spend?.totalCostUsd;
  const delegated = exchange.kind === "delegated-task";
  // The ledger keeps no prompt, so a delegated task's ask is the stand-in
  // "Subagent <key>": it only repeats the name, so the card has no task line.
  const standIn =
    delegated && exchange.ref.delegationKey
      ? i18n.t("agentRuns:exchange.extraCopy403", { value1: exchange.ref.delegationKey })
      : null;
  const firstLine =
    exchange.ask === standIn
      ? undefined
      : (exchange.ask.split("\n").find((line) => line.trim())?.trim() ?? exchange.ask);
  const steps = delegated ? [] : exchangeSteps(exchange);
  const resolveLabel = !delegated
    ? undefined
    : status.status === "waiting"
      ? i18n.t("fleet:agentTree.answer")
      : status.status === "failed"
        ? i18n.t("fleet:agentTree.open")
        : undefined;
  return {
    id: exchange.id,
    name: exchange.title,
    model: describeAgentIdentity(exchange.identity).text,
    ...(firstLine ? { task: firstLine } : {}),
    ...status,
    ...(typeof cost === "number" && Number.isFinite(cost) ? { cost } : {}),
    ...(live && exchange.timing.observed !== false && exchange.timing.startedAt !== null
      ? { startedAt: exchange.timing.startedAt }
      : elapsedMs !== null
        ? { elapsedMs }
        : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(status.status === "waiting" ? { ask: exchange.ask } : {}),
    ...(exchange.outcome.error ? { error: exchange.outcome.error } : {}),
    ...(resolveLabel ? { resolveLabel } : {}),
  };
}
