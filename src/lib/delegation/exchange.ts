import { i18n } from "@/i18n/runtime";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import {
  describeDelegatedTaskPhase,
  type DelegatedTaskBlockedKind,
} from "@/lib/runs/delegated-task-view";
import type {
  AgentNode,
  WorkGraph,
} from "@/lib/work-graph/work-graph.types";
import {
  exchangeStatusFromDelegatedTaskPhase,
  exchangeStatusFromWorkGraphStatus,
  isExchangeStatusLive,
  type ExchangeStatus,
} from "./format";

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Both kinds read as a Subagent: `delegated-task` is a durable Stave task the
 * caller started, `subagent` an in-turn provider subagent from the work graph.
 */
export type DelegationExchangeKind =
  | "delegated-task"
  | "subagent";

/** Where the delegate's model came from. */
export type DelegationIdentitySource =
  | "explicit"
  | "preset"
  | "auto"
  | "provider-default";

export interface DelegationIdentity {
  /** `Subagent`. */
  role: string;
  providerId?: ProviderId;
  model?: string;
  effort?: string;
  modelEvidence?: "requested" | "configured" | "reported";
  source?: DelegationIdentitySource;
  rationale?: string;
}

export interface DelegationSpend {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalCostUsd?: number;
}

export interface DelegationOutcome {
  status: ExchangeStatus;
  /** What came back: the subagent's answer or reason. */
  result?: string;
  error?: string;
  spend?: DelegationSpend;
  /** Progress narration the delegate reported while running, oldest first. */
  progress?: readonly string[];
}

export interface DelegationStage {
  at: number;
  label: string;
  detail?: string;
}

export interface DelegationTiming {
  /** `null` when the source carries no timestamp (saved transcript rows). */
  startedAt: number | null;
  endedAt?: number;
  deadlineAt?: number;
  stages: DelegationStage[];
}

/**
 * What the reader can do next. Descriptors only: the surface that renders the
 * exchange owns the handlers, because a store action and a pure render test
 * must see the same list.
 */
export type DelegationActionId =
  | "show-in-conversation"
  | "open"
  | "follow-up"
  | "retry"
  | "stop"
  | "detach"
  | "verdict";

export interface DelegationAction {
  id: DelegationActionId;
  label: string;
}

export interface DelegationSetup {
  isolation?: string;
  /** Deadline the delegate was given, as a span. */
  deadlineMs?: number;
  attempt?: number;
  /** Ledger lifecycle or child permission profile, when known. */
  lifecycle?: string;
  /** The model that asked, for the cross-model check. */
  primary?: { providerId: ProviderId; model?: string };
}

export interface DelegationExchangeRef {
  toolUseId?: string;
  delegationKey?: string;
  delegatedTaskId?: string;
  delegatedWorkspaceId?: string;
  turnId?: string;
  nodeKey?: string;
  agentId?: string;
}

export interface DelegationExchange {
  id: string;
  kind: DelegationExchangeKind;
  /** The subagent's agent or label, else the delegation key. */
  title: string;
  identity: DelegationIdentity;
  /** Question, assignment, or delegation prompt. */
  ask: string;
  outcome: DelegationOutcome;
  timing: DelegationTiming;
  actions: DelegationAction[];
  setup: DelegationSetup;
  ref: DelegationExchangeRef;
}

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                */
/* -------------------------------------------------------------------------- */

function parseIsoMs(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function fromDelegatedTask(
  child: DelegatedTaskSummary,
  opts?: { blockedKind?: DelegatedTaskBlockedKind | null; prompt?: string },
): DelegationExchange {
  const phase = describeDelegatedTaskPhase(child, opts?.blockedKind ?? null);
  const status: ExchangeStatus = exchangeStatusFromDelegatedTaskPhase(child.phase);
  const failed = status === "failed" || status === "cancelled";
  const actions: DelegationAction[] = [{ id: "open", label: i18n.t("agentRuns:exchange.label") }];
  const live = child.phase === "pending" || child.phase === "running" || child.phase === "waiting";
  if (live) {
    actions.push({ id: "follow-up", label: i18n.t("agentRuns:exchange.followUp") });
    actions.push({ id: "stop", label: i18n.t("agentRuns:exchange.label2") });
    actions.push({ id: "detach", label: i18n.t("agentRuns:exchange.label3") });
  // i18n-ignore: canonical provider or lifecycle text used for parsing
  } else if (child.phase !== "cancelled" || !child.reason?.startsWith("Detached")) {
    actions.push({ id: "retry", label: i18n.t("agentRuns:exchange.label4") });
  }
  const startedAt = parseIsoMs(child.createdAt) ?? null;
  const endedAt = parseIsoMs(child.completedAt);
  return {
    id: `delegated-task:${child.delegationKey}`,
    kind: "delegated-task",
    title: child.delegationKey,
    identity: {
      role: i18n.t("agentRuns:exchange.extraCopy404"),
      modelEvidence: "requested",
      providerId: child.providerId,
      ...(child.requestedModel ? { model: child.requestedModel } : {}),
      ...(child.requestedEffort ? { effort: child.requestedEffort } : {}),
      source: child.requestedModel ? "explicit" : "provider-default",
    },
    ask: opts?.prompt ?? i18n.t("agentRuns:exchange.extraCopy403", { value1: child.delegationKey }),
    outcome: {
      status,
      ...(failed && child.reason
        ? { error: child.reason }
        : child.result || child.reason
          ? { result: child.result ?? child.reason! }
          : {}),
      ...(phase.blocked ? { progress: [phase.label] } : {}),
    },
    timing: {
      startedAt,
      ...(endedAt !== undefined ? { endedAt } : {}),
      stages: [],
    },
    actions,
    setup: {
      attempt: child.attempt,
      lifecycle: child.lifecycle,
    },
    ref: {
      delegationKey: child.delegationKey,
      delegatedTaskId: child.delegatedTaskId,
      delegatedWorkspaceId: child.delegatedWorkspaceId,
    },
  };
}

export function fromWorkGraphNode(
  node: AgentNode,
  graph?: Pick<WorkGraph, "providerId"> | null,
): DelegationExchange {
  const status = exchangeStatusFromWorkGraphStatus(node.status);
  return {
    id: `subagent:${node.key}`,
    kind: "subagent",
    title: node.badge ? `${node.badge} · ${node.label}` : node.label,
    identity: {
      role: i18n.t("agentRuns:exchange.extraCopy404"),
      model: node.model,
      effort: node.effort,
      modelEvidence: node.modelEvidence,
      ...(graph ? { providerId: graph.providerId } : {}),
      source: "provider-default",
    },
    ask: node.label,
    outcome: {
      status,
      ...(node.reason
        ? status === "failed" || status === "cancelled"
          ? { error: node.reason }
          : { result: node.reason }
        : {}),
      ...(node.progress.length > 0 ? { progress: node.progress } : {}),
    },
    timing: {
      startedAt: node.startedAt,
      ...(node.completedAt !== undefined ? { endedAt: node.completedAt } : {}),
      stages: [],
    },
    actions: node.spawnedByToolUseId
      ? [{ id: "show-in-conversation", label: i18n.t("agentRuns:exchange.label5") }]
      : [],
    setup: {
      ...(node.attempt !== undefined ? { attempt: node.attempt } : {}),
    },
    ref: {
      nodeKey: node.key,
      agentId: node.agentId,
      ...(node.spawnedByToolUseId
        ? { toolUseId: node.spawnedByToolUseId }
        : {}),
      ...(node.delegationKey ? { delegationKey: node.delegationKey } : {}),
      ...(node.delegatedTaskId ? { delegatedTaskId: node.delegatedTaskId } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

export function isDelegationExchangeLive(exchange: DelegationExchange) {
  return isExchangeStatusLive(exchange.outcome.status);
}

/** Live exchanges first, each half in chronological order. */
export function partitionDelegationExchanges(
  exchanges: readonly DelegationExchange[],
): { live: DelegationExchange[]; settled: DelegationExchange[] } {
  const live: DelegationExchange[] = [];
  const settled: DelegationExchange[] = [];
  for (const exchange of exchanges) {
    (isDelegationExchangeLive(exchange) ? live : settled).push(exchange);
  }
  return { live, settled };
}

/** Oldest first; rows without a timestamp keep their relative order at the end. */
export function sortDelegationExchanges(
  exchanges: readonly DelegationExchange[],
): DelegationExchange[] {
  return exchanges
    .map((exchange, index) => ({ exchange, index }))
    .sort((left, right) => {
      const a = left.exchange.timing.startedAt;
      const b = right.exchange.timing.startedAt;
      if (a === null && b === null) return left.index - right.index;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b || left.index - right.index;
    })
    .map(({ exchange }) => exchange);
}

export interface SelectDelegationExchangesArgs {
  delegatedTasks?: readonly DelegatedTaskSummary[];
  childBlockedByDelegationKey?: Readonly<Record<string, DelegatedTaskBlockedKind>>;
  workGraph?: WorkGraph | null;
  /** Include provider subagents from the graph (ledger children are skipped). */
  includeSubagents?: boolean;
}

/**
 * Every subagent the task called, as one list, oldest first. Callers derive
 * this inside `useMemo` from stable store references — never inside a Zustand
 * selector, which must not manufacture a fresh array per render.
 */
export function selectDelegationExchanges(
  args: SelectDelegationExchangesArgs,
): DelegationExchange[] {
  const exchanges: DelegationExchange[] = [];
  for (const child of args.delegatedTasks ?? []) {
    exchanges.push(
      fromDelegatedTask(child, {
        blockedKind: args.childBlockedByDelegationKey?.[child.delegationKey] ?? null,
      }),
    );
  }
  if (args.includeSubagents && args.workGraph) {
    for (const key of args.workGraph.orderedNodeKeys) {
      const node = args.workGraph.nodesByKey[key];
      // The root stands for the primary turn itself, not a delegation.
      if (!node || node.delegationKey || key === args.workGraph.rootKey) {
        continue;
      }
      exchanges.push(fromWorkGraphNode(node, args.workGraph));
    }
  }
  return sortDelegationExchanges(exchanges);
}

/**
 * Wall-clock span of an exchange: to `endedAt` once settled, otherwise to
 * `nowMs`. `null` when the source never recorded a start.
 */
export function resolveExchangeElapsedMs(
  exchange: DelegationExchange,
  nowMs: number,
): number | null {
  const { startedAt, endedAt } = exchange.timing;
  if (startedAt === null) {
    return null;
  }
  const end = isDelegationExchangeLive(exchange)
    ? Math.max(nowMs, startedAt)
    : (endedAt ?? startedAt);
  return Math.max(0, end - startedAt);
}

export interface DelegationCounts {
  running: number;
  done: number;
  failed: number;
  total: number;
}

/** `Agents · 1 running · 2 done · 1 failed` — counts for a block header. */
export function countDelegationExchanges(
  exchanges: readonly DelegationExchange[],
): DelegationCounts {
  let running = 0;
  let done = 0;
  let failed = 0;
  for (const exchange of exchanges) {
    const status = exchange.outcome.status;
    if (status === "running" || status === "queued") {
      running += 1;
    } else if (status === "returned") {
      done += 1;
    } else {
      failed += 1;
    }
  }
  return { running, done, failed, total: exchanges.length };
}

export function formatDelegationCounts(counts: DelegationCounts): string {
  return [
    counts.running > 0 ? i18n.t("agentRuns:remaining.presentationCopy506", { v1: counts.running }) : null,
    counts.done > 0 ? i18n.t("agentRuns:remaining.presentationCopy507", { v1: counts.done }) : null,
    counts.failed > 0 ? i18n.t("agentRuns:remaining.presentationCopy508", { v1: counts.failed }) : null,
  ]
    .filter((segment): segment is string => segment !== null)
    .join(" · ");
}
