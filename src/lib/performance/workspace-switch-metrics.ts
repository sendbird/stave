export type WorkspaceSwitchPhase = "active" | "files" | "messages";

export interface WorkspaceSwitchMetric {
  token: number;
  workspaceId: string;
  startedAt: number;
  cacheHit: boolean;
  flushResolvedAt?: number;
  shellResolvedAt?: number;
  setRootResolvedAt?: number;
  activeResolvedAt?: number;
  filesResolvedAt?: number;
  messagesResolvedAt?: number;
}

export interface WorkspaceSwitchPerformanceSnapshot {
  workspaceId: string;
  cacheHit: boolean;
  totalMs: number;
  flushMs?: number;
  shellMs?: number;
  setRootMs?: number;
  filesMs?: number;
  messagesMs?: number;
}

const workspaceSwitchMetricsByWorkspaceId = new Map<
  string,
  WorkspaceSwitchMetric
>();
const MAX_WORKSPACE_SWITCH_METRICS = 20;
let latestWorkspaceSwitchMetric: WorkspaceSwitchMetric | null = null;

export function getWorkspaceSwitchMetricNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function roundDuration(value: number) {
  return Math.round(value * 100) / 100;
}

function isWorkspaceSwitchMetricLoggingEnabled() {
  return (
    typeof import.meta !== "undefined" &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  );
}

export function registerWorkspaceSwitchMetric(metric: WorkspaceSwitchMetric) {
  workspaceSwitchMetricsByWorkspaceId.delete(metric.workspaceId);
  workspaceSwitchMetricsByWorkspaceId.set(metric.workspaceId, metric);
  while (
    workspaceSwitchMetricsByWorkspaceId.size > MAX_WORKSPACE_SWITCH_METRICS
  ) {
    const oldestWorkspaceId = workspaceSwitchMetricsByWorkspaceId
      .keys()
      .next().value;
    if (!oldestWorkspaceId) break;
    workspaceSwitchMetricsByWorkspaceId.delete(oldestWorkspaceId);
  }
  latestWorkspaceSwitchMetric = metric;
}

export function recordWorkspaceSwitchPhase(args: {
  workspaceId: string;
  token?: number;
  phase: WorkspaceSwitchPhase;
  extra?: Record<string, unknown>;
}) {
  const metric = workspaceSwitchMetricsByWorkspaceId.get(args.workspaceId);
  if (!metric || (args.token !== undefined && metric.token !== args.token)) {
    return;
  }
  const now = getWorkspaceSwitchMetricNow();
  if (args.phase === "active") metric.activeResolvedAt = now;
  if (args.phase === "files") metric.filesResolvedAt = now;
  if (args.phase === "messages") metric.messagesResolvedAt = now;

  if (isWorkspaceSwitchMetricLoggingEnabled()) {
    console.info("[workspace-switch]", {
      workspaceId: args.workspaceId,
      phase: args.phase,
      cacheHit: metric.cacheHit,
      totalMs: roundDuration(now - metric.startedAt),
      ...(metric.flushResolvedAt !== undefined
        ? { flushMs: roundDuration(metric.flushResolvedAt - metric.startedAt) }
        : {}),
      ...(metric.shellResolvedAt !== undefined
        ? { shellMs: roundDuration(metric.shellResolvedAt - metric.startedAt) }
        : {}),
      ...(metric.setRootResolvedAt !== undefined
        ? {
            setRootMs: roundDuration(
              metric.setRootResolvedAt - metric.startedAt,
            ),
          }
        : {}),
      ...(args.extra ?? {}),
    });
  }
}

export function getLatestWorkspaceSwitchPerformance(): WorkspaceSwitchPerformanceSnapshot | null {
  const metric = latestWorkspaceSwitchMetric;
  if (!metric?.activeResolvedAt) return null;
  return {
    workspaceId: metric.workspaceId,
    cacheHit: metric.cacheHit,
    totalMs: roundDuration(metric.activeResolvedAt - metric.startedAt),
    ...(metric.flushResolvedAt !== undefined
      ? { flushMs: roundDuration(metric.flushResolvedAt - metric.startedAt) }
      : {}),
    ...(metric.shellResolvedAt !== undefined
      ? { shellMs: roundDuration(metric.shellResolvedAt - metric.startedAt) }
      : {}),
    ...(metric.setRootResolvedAt !== undefined
      ? {
          setRootMs: roundDuration(metric.setRootResolvedAt - metric.startedAt),
        }
      : {}),
    ...(metric.filesResolvedAt !== undefined
      ? { filesMs: roundDuration(metric.filesResolvedAt - metric.startedAt) }
      : {}),
    ...(metric.messagesResolvedAt !== undefined
      ? {
          messagesMs: roundDuration(
            metric.messagesResolvedAt - metric.startedAt,
          ),
        }
      : {}),
  };
}
