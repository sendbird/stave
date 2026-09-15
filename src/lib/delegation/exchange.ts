import {
  buildAdvisorChecks,
  describeAdvisorIsolation,
  describeAdvisorPhase,
  type AdvisorCheck,
} from "@/components/session/advisor-exchange.utils";
import type { AdvisorConsultLogStatus } from "@/components/session/advisor-consult-log.utils";
import type { AdvisorTranscriptExchange } from "@/lib/collaboration/advisor-transcript";
import type { WorkerExchange } from "@/lib/collaboration/worker-exchanges";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  advisorConsultLogEntryKey,
  type AdvisorConsultLogEntry,
} from "@/lib/providers/advisor-consult-log";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  getWorkerPreset,
  type WorkerExecutionMetadata,
} from "@/lib/providers/worker-mode";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import {
  describeChildTaskPhase,
  type ChildTaskBlockedKind,
} from "@/lib/runs/child-task-view";
import type {
  AgentNode,
  WorkGraph,
} from "@/lib/work-graph/work-graph.types";
import {
  exchangeStatusFromAdvisorOutcome,
  exchangeStatusFromChildTaskPhase,
  exchangeStatusFromToolState,
  exchangeStatusFromWorkGraphStatus,
  isExchangeStatusLive,
  type ExchangeStatus,
} from "./format";

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

export type DelegationExchangeKind =
  | "advisor"
  | "worker"
  | "child-task"
  | "subagent";

/** Where the delegate's model came from. */
export type DelegationIdentitySource =
  | "explicit"
  | "preset"
  | "auto"
  | "provider-default";

export interface DelegationIdentity {
  /** `Advisor`, `Worker`, `Child task`, `Subagent`. */
  role: string;
  providerId?: ProviderId;
  model?: string;
  effort?: string;
  source?: DelegationIdentitySource;
  rationale?: string;
}

export type DelegationCheck = AdvisorCheck;

export interface DelegationSpend {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalCostUsd?: number;
}

export interface DelegationOutcome {
  status: ExchangeStatus;
  /** What came back: advice, worker result, child reason. */
  result?: string;
  error?: string;
  checks?: DelegationCheck[];
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
  | "cancel"
  | "dismiss"
  | "open-log"
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
  consultIndex?: number;
  consultLimit?: number;
  presetLabel?: string;
  attempt?: number;
  /** Ledger lifecycle or child permission profile, when known. */
  lifecycle?: string;
  /** The model that asked, for the cross-model check. */
  primary?: { providerId: ProviderId; model?: string };
}

export interface DelegationExchangeRef {
  toolUseId?: string;
  delegationKey?: string;
  childTaskId?: string;
  childWorkspaceId?: string;
  entryKey?: string;
  turnId?: string;
  nodeKey?: string;
}

export interface DelegationExchange {
  id: string;
  kind: DelegationExchangeKind;
  /** `Advisor consult 1/3`, `Worker · Verified patch`, the delegation key. */
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

const ADVISOR_ASK_EMPTY = "The runtime did not report the question.";
const WORKER_ASK_EMPTY = "Open the transcript for the original assignment.";

export function fromAdvisorSnapshot(
  snapshot: AdvisorExchangeSnapshot,
  opts?: {
    /** Log status when the consult is archived; falls back to the outcome. */
    status?: AdvisorConsultLogStatus;
    /** True while the consult can still be cancelled. */
    canCancel?: boolean;
    /** The task has archived consults, so the detail can open the log. */
    hasConsultLog?: boolean;
    /** Show a dismiss action (the ambient card's own affordance). */
    canDismiss?: boolean;
  },
): DelegationExchange {
  const status = exchangeStatusFromAdvisorOutcome(
    opts?.status ?? snapshot.outcome,
  );
  const spend: DelegationSpend = {
    ...(snapshot.inputTokens !== undefined
      ? { inputTokens: snapshot.inputTokens }
      : {}),
    ...(snapshot.outputTokens !== undefined
      ? { outputTokens: snapshot.outputTokens }
      : {}),
    ...(snapshot.cacheReadTokens !== undefined
      ? { cacheReadTokens: snapshot.cacheReadTokens }
      : {}),
    ...(snapshot.cacheCreationTokens !== undefined
      ? { cacheCreationTokens: snapshot.cacheCreationTokens }
      : {}),
    ...(snapshot.totalCostUsd !== undefined
      ? { totalCostUsd: snapshot.totalCostUsd }
      : {}),
  };
  const failed =
    snapshot.outcome === "failed" ||
    snapshot.outcome === "timeout" ||
    snapshot.outcome === "aborted" ||
    snapshot.outcome === "skipped";
  const actions: DelegationAction[] = [];
  if (opts?.canCancel && snapshot.outcome === "pending") {
    actions.push({ id: "cancel", label: "Cancel consult" });
  }
  if (opts?.hasConsultLog) {
    actions.push({ id: "open-log", label: "View all consults" });
  }
  if (opts?.canDismiss && snapshot.outcome !== "pending") {
    actions.push({ id: "dismiss", label: "Dismiss" });
  }
  const title =
    snapshot.outcome === "armed"
      ? "Advisor armed"
      : snapshot.consultIndex !== undefined && snapshot.consultLimit !== undefined
        ? `Advisor consult ${snapshot.consultIndex}/${snapshot.consultLimit}`
        : "Advisor consult";
  return {
    id: `advisor:${advisorConsultLogEntryKey(snapshot)}`,
    kind: "advisor",
    title,
    identity: {
      role: "Advisor",
      ...(snapshot.advisorProviderId
        ? { providerId: snapshot.advisorProviderId }
        : {}),
      ...(snapshot.advisorModel ? { model: snapshot.advisorModel } : {}),
      ...(snapshot.advisorEffort ? { effort: snapshot.advisorEffort } : {}),
      source: "explicit",
    },
    ask: snapshot.question ?? ADVISOR_ASK_EMPTY,
    outcome: {
      status,
      ...(snapshot.advice ? { result: snapshot.advice } : {}),
      ...(failed && snapshot.detail ? { error: snapshot.detail } : {}),
      checks: buildAdvisorChecks(snapshot),
      ...(Object.keys(spend).length > 0 ? { spend } : {}),
      ...(snapshot.progressDetail && snapshot.outcome === "pending"
        ? { progress: [snapshot.progressDetail] }
        : {}),
    },
    timing: {
      startedAt: snapshot.startedAt,
      ...(snapshot.outcomeAt !== undefined ? { endedAt: snapshot.outcomeAt } : {}),
      ...(snapshot.timeoutMs !== undefined
        ? { deadlineAt: snapshot.startedAt + snapshot.timeoutMs }
        : {}),
      stages: snapshot.stages.map((stage) => ({
        at: stage.at,
        label: describeAdvisorPhase(stage.phase),
        ...(stage.detail ? { detail: stage.detail } : {}),
      })),
    },
    actions,
    setup: {
      isolation: describeAdvisorIsolation(snapshot.isolation),
      ...(snapshot.timeoutMs !== undefined
        ? { deadlineMs: snapshot.timeoutMs }
        : {}),
      ...(snapshot.consultIndex !== undefined
        ? { consultIndex: snapshot.consultIndex }
        : {}),
      ...(snapshot.consultLimit !== undefined
        ? { consultLimit: snapshot.consultLimit }
        : {}),
      primary: {
        providerId: snapshot.primaryProviderId,
        ...(snapshot.primaryModel ? { model: snapshot.primaryModel } : {}),
      },
    },
    ref: {
      entryKey: advisorConsultLogEntryKey(snapshot),
      turnId: snapshot.turnId,
    },
  };
}

export function fromAdvisorLogEntry(
  entry: AdvisorConsultLogEntry,
  opts: { activeTurnId: string | null; hasConsultLog?: boolean },
): DelegationExchange {
  const status: AdvisorConsultLogStatus =
    entry.snapshot.outcome !== "pending"
      ? entry.snapshot.outcome
      : entry.snapshot.turnId === opts.activeTurnId
        ? "pending"
        : "unresolved";
  return fromAdvisorSnapshot(entry.snapshot, {
    status,
    hasConsultLog: opts.hasConsultLog ?? true,
  });
}

/**
 * A recovered transcript consult, used only when the store never saw the
 * consult (a restart, or a saved-history page). Identity is unknown here: the
 * tool result carries the advice, not the model that produced it.
 */
export function fromAdvisorTranscript(
  row: AdvisorTranscriptExchange,
): DelegationExchange {
  const status = exchangeStatusFromToolState(row.state);
  return {
    id: `advisor-transcript:${row.id}`,
    kind: "advisor",
    title: "Advisor consult",
    identity: { role: "Advisor" },
    ask: row.question,
    outcome: {
      status,
      ...(status === "failed" ? { error: row.answer } : { result: row.answer }),
    },
    timing: { startedAt: row.at ?? null, stages: [] },
    actions: row.toolUseId
      ? [{ id: "show-in-conversation", label: "Show in conversation" }]
      : [],
    setup: {},
    ref: { ...(row.toolUseId ? { toolUseId: row.toolUseId } : {}) },
  };
}

function workerSource(
  source: WorkerExchange["modelSource"] | WorkerExecutionMetadata["workerModelSource"],
): DelegationIdentitySource | undefined {
  if (!source) {
    return undefined;
  }
  return source;
}

export function fromWorkerExchange(
  row: WorkerExchange,
  execution?: WorkerExecutionMetadata | null,
): DelegationExchange {
  const status = exchangeStatusFromToolState(row.state);
  const model =
    execution?.runtimeWorkerModel ??
    row.runtimeModel ??
    execution?.resolvedWorkerModel ??
    row.resolvedModel ??
    (row.model === "Model not reported" ? undefined : row.model);
  const providerId =
    execution?.providerId ?? (model ? inferProviderIdFromModel({ model }) : undefined);
  const source = workerSource(execution?.workerModelSource ?? row.modelSource);
  const rationale = execution?.workerModelRationale ?? row.modelRationale;
  const presetLabel = execution
    ? getWorkerPreset(execution.presetId).label
    : undefined;
  return {
    id: `worker:${row.id}`,
    kind: "worker",
    title: presetLabel ? `Worker · ${presetLabel}` : "Worker run",
    identity: {
      role: "Worker",
      ...(providerId ? { providerId } : {}),
      ...(model ? { model } : {}),
      ...(execution?.workerEffort ? { effort: execution.workerEffort } : {}),
      ...(source ? { source } : {}),
      ...(rationale ? { rationale } : {}),
    },
    ask: row.assignment || WORKER_ASK_EMPTY,
    outcome: {
      status,
      ...(row.result
        ? status === "failed"
          ? { error: row.result }
          : { result: row.result }
        : {}),
      ...(row.progress.length > 0 ? { progress: row.progress } : {}),
    },
    timing: {
      startedAt: row.at ?? null,
      ...(row.endedAt !== undefined ? { endedAt: row.endedAt } : {}),
      stages: [],
    },
    actions: row.toolUseId
      ? [{ id: "show-in-conversation", label: "Show in conversation" }]
      : [],
    setup: {
      ...(presetLabel ? { presetLabel } : {}),
      ...(execution
        ? {
            primary: {
              providerId: execution.providerId,
              model: execution.primaryModel,
            },
          }
        : {}),
    },
    ref: { ...(row.toolUseId ? { toolUseId: row.toolUseId } : {}) },
  };
}

/**
 * A live worker run as the shelf sees it, before the transcript has settled.
 * The work item carries the same execution metadata the tool part will.
 */
export function fromWorkerWorkItem(item: ProviderTurnWorkItem): DelegationExchange {
  const state =
    item.status === "completed"
      ? "output-available"
      : item.status === "failed"
        ? "output-error"
        : "input-available";
  const row: WorkerExchange = {
    id: item.toolUseId ?? item.id,
    ...(item.toolUseId ? { toolUseId: item.toolUseId } : {}),
    model:
      item.workerExecution?.runtimeWorkerModel ??
      item.workerExecution?.resolvedWorkerModel ??
      item.workerExecution?.workerModel ??
      "Model not reported",
    state,
    assignment: item.detail ?? item.title,
    result: "",
    progress: item.progressMessages,
    at: item.startedAt,
    ...(item.status === "completed" || item.status === "failed"
      ? { endedAt: item.updatedAt }
      : {}),
  };
  return fromWorkerExchange(row, item.workerExecution ?? null);
}

function parseIsoMs(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function fromChildTask(
  child: ChildTaskSummary,
  opts?: { blockedKind?: ChildTaskBlockedKind | null; prompt?: string },
): DelegationExchange {
  const phase = describeChildTaskPhase(child, opts?.blockedKind ?? null);
  const status: ExchangeStatus = exchangeStatusFromChildTaskPhase(child.phase);
  const failed = status === "failed" || status === "cancelled";
  const actions: DelegationAction[] = [{ id: "open", label: "Open" }];
  const live = child.phase === "pending" || child.phase === "running" || child.phase === "waiting";
  if (live) {
    actions.push({ id: "follow-up", label: "Follow-up" });
    actions.push({ id: "stop", label: "Stop" });
    actions.push({ id: "detach", label: "Detach" });
  } else if (child.phase !== "cancelled" || !child.reason?.startsWith("Detached")) {
    actions.push({ id: "retry", label: "Retry" });
  }
  const startedAt = parseIsoMs(child.createdAt) ?? null;
  const endedAt = parseIsoMs(child.completedAt);
  return {
    id: `child-task:${child.delegationKey}`,
    kind: "child-task",
    title: child.delegationKey,
    identity: {
      role: "Child task",
      providerId: child.providerId,
      ...(child.requestedModel ? { model: child.requestedModel } : {}),
      ...(child.requestedEffort ? { effort: child.requestedEffort } : {}),
      source: child.requestedModel ? "explicit" : "provider-default",
    },
    ask: opts?.prompt ?? `Delegated task ${child.delegationKey}`,
    outcome: {
      status,
      ...(child.reason
        ? failed
          ? { error: child.reason }
          : { result: child.reason }
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
      childTaskId: child.childTaskId,
      childWorkspaceId: child.childWorkspaceId,
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
      role: "Subagent",
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
      ? [{ id: "show-in-conversation", label: "Show in conversation" }]
      : [],
    setup: {
      ...(node.attempt !== undefined ? { attempt: node.attempt } : {}),
    },
    ref: {
      nodeKey: node.key,
      ...(node.spawnedByToolUseId
        ? { toolUseId: node.spawnedByToolUseId }
        : {}),
      ...(node.delegationKey ? { delegationKey: node.delegationKey } : {}),
      ...(node.childTaskId ? { childTaskId: node.childTaskId } : {}),
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

/**
 * Whether a transcript consult is already represented by a store consult.
 *
 * The runtime reports no tool-use id on advisor events, so the only shared key
 * is the question text (bounded identically on both sides). When no consult
 * carries a question at all, every transcript row is treated as a duplicate as
 * soon as the store holds any consult: rendering both would show the same
 * consult twice, which is the failure this guards against.
 */
export function isAdvisorTranscriptDuplicate(args: {
  row: AdvisorTranscriptExchange;
  consults: readonly AdvisorConsultLogEntry[];
}): boolean {
  if (args.consults.length === 0) {
    return false;
  }
  const questioned = args.consults.filter((entry) => entry.snapshot.question);
  if (questioned.length === 0) {
    return true;
  }
  const question = args.row.question.trim();
  return questioned.some(
    (entry) => entry.snapshot.question?.trim() === question,
  );
}

export interface SelectDelegationExchangesArgs {
  /** Archived consults for the task, newest first (store order). */
  consults: readonly AdvisorConsultLogEntry[];
  /** The live snapshot; skipped when the log already holds it. */
  advisorSnapshot?: AdvisorExchangeSnapshot | null;
  activeTurnId: string | null;
  advisorTranscript?: readonly AdvisorTranscriptExchange[];
  workers?: readonly WorkerExchange[];
  /** Live worker runs from the turn's work items, when the transcript has none. */
  workerWorkItems?: readonly ProviderTurnWorkItem[];
  /** Live tool parts' execution metadata by tool-use id, when in memory. */
  workerExecutionByToolUseId?: Readonly<
    Record<string, WorkerExecutionMetadata | undefined>
  >;
  childTasks?: readonly ChildTaskSummary[];
  childBlockedByDelegationKey?: Readonly<Record<string, ChildTaskBlockedKind>>;
  workGraph?: WorkGraph | null;
  /** Include provider subagents from the graph (ledger children are skipped). */
  includeSubagents?: boolean;
  advisorOptions?: {
    canCancel?: boolean;
    canDismiss?: boolean;
    /** Override when the caller knows archived consults exist beyond `consults`. */
    hasConsultLog?: boolean;
  };
}

/**
 * Every delegation the task made, as one list, oldest first. Callers derive
 * this inside `useMemo` from stable store references — never inside a Zustand
 * selector, which must not manufacture a fresh array per render.
 */
export function selectDelegationExchanges(
  args: SelectDelegationExchangesArgs,
): DelegationExchange[] {
  const exchanges: DelegationExchange[] = [];
  const hasConsultLog =
    args.advisorOptions?.hasConsultLog ?? args.consults.length > 0;
  const seenAdvisorKeys = new Set<string>();

  if (args.advisorSnapshot && args.advisorSnapshot.outcome !== "armed") {
    const key = advisorConsultLogEntryKey(args.advisorSnapshot);
    seenAdvisorKeys.add(key);
    exchanges.push(
      fromAdvisorSnapshot(args.advisorSnapshot, {
        canCancel: args.advisorOptions?.canCancel,
        canDismiss: args.advisorOptions?.canDismiss,
        hasConsultLog,
      }),
    );
  }
  for (const entry of args.consults) {
    if (seenAdvisorKeys.has(entry.key)) {
      continue;
    }
    seenAdvisorKeys.add(entry.key);
    exchanges.push(
      fromAdvisorLogEntry(entry, {
        activeTurnId: args.activeTurnId,
        hasConsultLog,
      }),
    );
  }
  for (const row of args.advisorTranscript ?? []) {
    if (isAdvisorTranscriptDuplicate({ row, consults: args.consults })) {
      continue;
    }
    exchanges.push(fromAdvisorTranscript(row));
  }
  const seenWorkerToolUseIds = new Set<string>();
  for (const row of args.workers ?? []) {
    if (row.toolUseId) {
      seenWorkerToolUseIds.add(row.toolUseId);
    }
    const execution = row.toolUseId
      ? args.workerExecutionByToolUseId?.[row.toolUseId]
      : undefined;
    exchanges.push(fromWorkerExchange(row, execution ?? null));
  }
  for (const item of args.workerWorkItems ?? []) {
    if (!item.workerExecution) {
      continue;
    }
    if (item.toolUseId && seenWorkerToolUseIds.has(item.toolUseId)) {
      continue;
    }
    exchanges.push(fromWorkerWorkItem(item));
  }
  for (const child of args.childTasks ?? []) {
    exchanges.push(
      fromChildTask(child, {
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
    counts.running > 0 ? `${counts.running} running` : null,
    counts.done > 0 ? `${counts.done} done` : null,
    counts.failed > 0 ? `${counts.failed} failed` : null,
  ]
    .filter((segment): segment is string => segment !== null)
    .join(" · ");
}
