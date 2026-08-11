import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  isSubagentToolName,
  resolveSubagentBadge,
  resolveToolTitle,
  truncateWorkText,
} from "@/lib/providers/subagent-identity";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import type { ToolUsePart } from "@/types/chat";
import {
  isTerminalWorkGraphStatus,
  ledgerNodeKey,
  providerAgentNodeKey,
  toolCallNodeKey,
  turnNodeKey,
  WORK_GRAPH_NODE_LIMIT,
  WORK_GRAPH_PROGRESS_LIMIT,
  WORK_GRAPH_WORK_ITEM_LIMIT,
  type AgentNode,
  type Dependency,
  type Interaction,
  type WorkGraph,
  type WorkGraphStatus,
  type WorkItem,
} from "./work-graph.types";

/**
 * The work graph reducer: provider events in, graph out, nothing else.
 *
 * Three properties are load-bearing and every change here must preserve them,
 * because the event stream violates all three assumptions a naive reducer would
 * make:
 *
 * - **Late.** A child's events can arrive after its parent's completion. A node
 *   is therefore created on first mention from any direction, and a parent that
 *   has not appeared yet parks its children in `pendingChildKeysByParentKey`
 *   instead of losing the edge.
 * - **Duplicate.** Runtimes replay tool state on reconnect. Every write is
 *   keyed and idempotent, and a terminal status never regresses — a replayed
 *   `running` after a `completed` is dropped rather than resurrecting the node.
 * - **Partial.** Most fields are optional on the wire. A field that is absent
 *   is never treated as a value: it leaves what the graph already knew intact.
 *
 * The reducer is pure. Time enters through an explicit `now`, so the same event
 * log always produces the same graph.
 */

/**
 * What an agent is called before anything describes it — the placeholder given
 * to a node materialized from a bare `ownerAgentId`.
 *
 * It is tracked as a constant rather than inlined because the label merge has
 * to be able to tell "we know nothing yet" from a real name: a spawn arriving
 * later with a description must replace it, while a spawn arriving with an
 * empty input must not overwrite a description already on the node.
 */
const UNNAMED_AGENT_LABEL = "Agent";

/**
 * The best name available for a node, preferring a description the spawn
 * carried, then whatever the node is already called, then the tool name.
 *
 * The ordering matters because a tool's later events routinely arrive with an
 * empty input: without the middle term, "Sweep the callers" degrades to "Task"
 * the moment the call completes.
 */
function resolveNodeLabel(
  toolName: string,
  input: string,
  existingLabel: string | undefined,
) {
  const current =
    existingLabel && existingLabel !== UNNAMED_AGENT_LABEL
      ? existingLabel
      : undefined;
  return resolveToolTitle(toolName, input, current);
}

const TOOL_STATE_STATUS: Record<ToolUsePart["state"], WorkGraphStatus> = {
  "input-streaming": "pending",
  "input-available": "running",
  "output-available": "completed",
  "output-error": "failed",
};

/**
 * Child phases are run-ledger statuses; the graph speaks its own status
 * vocabulary so a ledger rename cannot silently change what a node looks like.
 */
const CHILD_PHASE_STATUS: Record<string, WorkGraphStatus> = {
  pending: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

export function createWorkGraph(args: {
  turnId: string;
  providerId: ProviderId;
  startedAt: number;
}): WorkGraph {
  const rootKey = turnNodeKey(args.turnId);
  const root: AgentNode = {
    key: rootKey,
    identitySource: "provider",
    parentKey: null,
    label: "This turn",
    status: "running",
    startedAt: args.startedAt,
    updatedAt: args.startedAt,
    progress: [],
  };
  return {
    turnId: args.turnId,
    providerId: args.providerId,
    rootKey,
    startedAt: args.startedAt,
    updatedAt: args.startedAt,
    nodesByKey: { [rootKey]: root },
    orderedNodeKeys: [rootKey],
    workItemsById: {},
    orderedWorkItemIds: [],
    dependenciesById: {},
    interactionsById: {},
    artifactsById: {},
    pendingChildKeysByParentKey: {},
    nodeKeyBySpawnToolUseId: {},
  };
}

/**
 * A status may move forward but never back out of a terminal state.
 *
 * Without this, a replayed or out-of-order `running` after a `completed` makes
 * a finished subagent look alive again — and because the tree derives "the turn
 * is still working" from node status, one stale event would keep a settled turn
 * spinning forever.
 */
function advanceStatus(
  current: WorkGraphStatus,
  next: WorkGraphStatus | undefined,
): WorkGraphStatus {
  if (!next || next === current) {
    return current;
  }
  if (isTerminalWorkGraphStatus(current)) {
    return current;
  }
  return next;
}

function appendProgress(progress: string[], line: string | undefined) {
  if (!line) {
    return progress;
  }
  if (progress.at(-1) === line) {
    return progress;
  }
  const next = [...progress, line];
  return next.length > WORK_GRAPH_PROGRESS_LIMIT
    ? next.slice(next.length - WORK_GRAPH_PROGRESS_LIMIT)
    : next;
}

/**
 * Create the node if it is new, otherwise fold in whatever this event knew.
 *
 * Returns the same graph object when nothing changed, so callers can rely on
 * reference equality to skip re-renders on the many events that only repeat
 * what the graph already holds.
 */
function upsertNode(
  graph: WorkGraph,
  key: string,
  patch: Partial<Omit<AgentNode, "key">> & {
    identitySource: AgentNode["identitySource"];
    label?: string;
  },
  now: number,
): WorkGraph {
  const existing = graph.nodesByKey[key];
  if (!existing) {
    if (graph.orderedNodeKeys.length >= WORK_GRAPH_NODE_LIMIT) {
      return graph;
    }
    const node: AgentNode = {
      key,
      identitySource: patch.identitySource,
      agentId: patch.agentId,
      delegationKey: patch.delegationKey,
      childTaskId: patch.childTaskId,
      spawnedByToolUseId: patch.spawnedByToolUseId,
      parentKey: patch.parentKey ?? null,
      label: patch.label ?? UNNAMED_AGENT_LABEL,
      badge: patch.badge,
      status: patch.status ?? "running",
      startedAt: patch.startedAt ?? now,
      updatedAt: now,
      completedAt: patch.completedAt,
      progress: patch.progress ?? [],
      reason: patch.reason,
    };
    const withNode: WorkGraph = {
      ...graph,
      updatedAt: now,
      nodesByKey: { ...graph.nodesByKey, [key]: node },
      orderedNodeKeys: [...graph.orderedNodeKeys, key],
    };
    return adoptPendingChildren(linkToParent(withNode, node, now), key, now);
  }

  const status = advanceStatus(existing.status, patch.status);
  const next: AgentNode = {
    ...existing,
    agentId: patch.agentId ?? existing.agentId,
    delegationKey: patch.delegationKey ?? existing.delegationKey,
    childTaskId: patch.childTaskId ?? existing.childTaskId,
    spawnedByToolUseId:
      patch.spawnedByToolUseId ?? existing.spawnedByToolUseId,
    // A reported parent wins over "root": the root parent is what a node gets
    // before anyone claims it, so a later claim is new information, not a
    // conflict. A second, different claim is ignored — the first spawn is the
    // real one and re-parenting mid-turn would make the tree jump.
    parentKey:
      existing.parentKey === null || existing.parentKey === graph.rootKey
        ? (patch.parentKey ?? existing.parentKey)
        : existing.parentKey,
    label: patch.label ?? existing.label,
    badge: patch.badge ?? existing.badge,
    status,
    completedAt:
      patch.completedAt ??
      (isTerminalWorkGraphStatus(status) && !existing.completedAt
        ? now
        : existing.completedAt),
    progress: patch.progress ?? existing.progress,
    reason: patch.reason ?? existing.reason,
  };
  if (isNodeUnchanged(existing, next)) {
    return graph;
  }
  next.updatedAt = now;
  const withNode: WorkGraph = {
    ...graph,
    updatedAt: now,
    nodesByKey: { ...graph.nodesByKey, [key]: next },
  };
  return existing.parentKey === next.parentKey
    ? withNode
    : linkToParent(withNode, next, now);
}

function isNodeUnchanged(previous: AgentNode, next: AgentNode) {
  return (
    previous.agentId === next.agentId &&
    previous.delegationKey === next.delegationKey &&
    previous.childTaskId === next.childTaskId &&
    previous.spawnedByToolUseId === next.spawnedByToolUseId &&
    previous.parentKey === next.parentKey &&
    previous.label === next.label &&
    previous.badge === next.badge &&
    previous.status === next.status &&
    previous.completedAt === next.completedAt &&
    previous.progress === next.progress &&
    previous.reason === next.reason
  );
}

/**
 * Record the spawn edge, parking the child if its parent has not arrived.
 *
 * The park list is the whole reason out-of-order streams do not lose structure:
 * a child that names a parent Stave has never seen keeps its claim on record so
 * the edge appears the moment the parent does, instead of the child sitting at
 * the root forever with its real position discarded.
 */
function linkToParent(graph: WorkGraph, node: AgentNode, now: number) {
  const parentKey = node.parentKey;
  if (!parentKey || parentKey === node.key) {
    return graph;
  }
  if (!graph.nodesByKey[parentKey]) {
    const parked = graph.pendingChildKeysByParentKey[parentKey] ?? [];
    if (parked.includes(node.key)) {
      return graph;
    }
    return {
      ...graph,
      pendingChildKeysByParentKey: {
        ...graph.pendingChildKeysByParentKey,
        [parentKey]: [...parked, node.key],
      },
    };
  }
  return recordDependency(
    graph,
    { id: `spawn:${parentKey}->${node.key}`, kind: "spawn", from: parentKey, to: node.key },
    now,
  );
}

/** A parent finally arrived: give it the children that were waiting on it. */
function adoptPendingChildren(graph: WorkGraph, parentKey: string, now: number) {
  const parked = graph.pendingChildKeysByParentKey[parentKey];
  if (!parked?.length) {
    return graph;
  }
  const { [parentKey]: _adopted, ...rest } = graph.pendingChildKeysByParentKey;
  let next: WorkGraph = { ...graph, pendingChildKeysByParentKey: rest };
  for (const childKey of parked) {
    if (!next.nodesByKey[childKey]) {
      continue;
    }
    next = recordDependency(
      next,
      {
        id: `spawn:${parentKey}->${childKey}`,
        kind: "spawn",
        from: parentKey,
        to: childKey,
      },
      now,
    );
  }
  return next;
}

function recordDependency(
  graph: WorkGraph,
  dependency: Dependency,
  now: number,
): WorkGraph {
  if (graph.dependenciesById[dependency.id]) {
    return graph;
  }
  return {
    ...graph,
    updatedAt: now,
    dependenciesById: {
      ...graph.dependenciesById,
      [dependency.id]: dependency,
    },
  };
}

function upsertWorkItem(
  graph: WorkGraph,
  item: Omit<WorkItem, "updatedAt"> & { updatedAt?: number },
  now: number,
): WorkGraph {
  const existing = graph.workItemsById[item.id];
  if (!existing) {
    if (graph.orderedWorkItemIds.length >= WORK_GRAPH_WORK_ITEM_LIMIT) {
      return graph;
    }
    return {
      ...graph,
      updatedAt: now,
      workItemsById: {
        ...graph.workItemsById,
        [item.id]: { ...item, updatedAt: now },
      },
      orderedWorkItemIds: [...graph.orderedWorkItemIds, item.id],
    };
  }
  const status = advanceStatus(existing.status, item.status);
  const next: WorkItem = {
    ...existing,
    // The owning node can sharpen once identity arrives (a call first seen at
    // the root, then attributed to the agent that made it), but it never moves
    // between two named agents.
    nodeKey:
      existing.nodeKey === graph.rootKey ? item.nodeKey : existing.nodeKey,
    title: item.title || existing.title,
    detail: item.detail ?? existing.detail,
    toolUseId: item.toolUseId ?? existing.toolUseId,
    status,
    completedAt:
      isTerminalWorkGraphStatus(status) && !existing.completedAt
        ? now
        : existing.completedAt,
    updatedAt: now,
  };
  if (
    next.nodeKey === existing.nodeKey &&
    next.title === existing.title &&
    next.detail === existing.detail &&
    next.toolUseId === existing.toolUseId &&
    next.status === existing.status &&
    next.completedAt === existing.completedAt
  ) {
    return graph;
  }
  return {
    ...graph,
    updatedAt: now,
    workItemsById: { ...graph.workItemsById, [item.id]: next },
  };
}

/**
 * Which node *emitted* this event.
 *
 * The two provider fields answering this question mean opposite things and are
 * kept apart on purpose (see `NormalizedProviderEvent`): `ownerAgentId` names
 * the agent we are already inside, while `agentId` names an agent this call
 * spawned. Reading a spawn id as an owner id inverts the edge and hangs the
 * parent off its own child.
 */
function resolveOwnerKey(
  graph: WorkGraph,
  event: { ownerAgentId?: string; parentToolUseId?: string },
): string {
  if (event.ownerAgentId) {
    return providerAgentNodeKey(graph.providerId, event.ownerAgentId);
  }
  if (event.parentToolUseId) {
    const spawned = graph.nodeKeyBySpawnToolUseId[event.parentToolUseId];
    if (spawned) {
      return spawned;
    }
  }
  return graph.rootKey;
}

/**
 * Which node a spawning call created — provider identity when the runtime named
 * it, the call itself only as a labelled fallback.
 *
 * The fallback is what keeps a provider that reports nothing but tool calls
 * legible, and `identitySource: "tool-call"` is what keeps it honest: the node
 * shows the work and is never offered a control aimed at an agent it cannot
 * name.
 */
function resolveSpawnedNode(
  graph: WorkGraph,
  event: { agentId?: string; toolUseId?: string },
) {
  if (event.agentId) {
    return {
      key: providerAgentNodeKey(graph.providerId, event.agentId),
      identitySource: "provider" as const,
      agentId: event.agentId,
    };
  }
  if (event.toolUseId) {
    return {
      key: toolCallNodeKey(event.toolUseId),
      identitySource: "tool-call" as const,
      agentId: undefined,
    };
  }
  return null;
}

export function reduceWorkGraphEvent(
  graph: WorkGraph,
  event: NormalizedProviderEvent,
  now: number,
): WorkGraph {
  switch (event.type) {
    case "tool": {
      const ownerKey = resolveOwnerKey(graph, event);
      let next = ensureOwnerNode(graph, ownerKey, now);
      const status = TOOL_STATE_STATUS[event.state];

      if (isSubagentToolName(event.toolName)) {
        const spawned = resolveSpawnedNode(next, event);
        if (spawned) {
          next = upsertNode(
            next,
            spawned.key,
            {
              identitySource: spawned.identitySource,
              agentId: spawned.agentId,
              spawnedByToolUseId: event.toolUseId,
              parentKey: ownerKey,
              label: resolveNodeLabel(
                event.toolName,
                event.input,
                next.nodesByKey[spawned.key]?.label,
              ),
              badge: resolveSubagentBadge(event.input),
              status,
            },
            now,
          );
          if (event.toolUseId && !next.nodeKeyBySpawnToolUseId[event.toolUseId]) {
            next = {
              ...next,
              nodeKeyBySpawnToolUseId: {
                ...next.nodeKeyBySpawnToolUseId,
                [event.toolUseId]: spawned.key,
              },
            };
          }
          return upsertWorkItem(
            next,
            {
              id: workItemId(event.toolUseId, ownerKey, event.toolName),
              nodeKey: ownerKey,
              kind: "delegation",
              status,
              title: next.nodesByKey[spawned.key]?.label ?? "Delegated work",
              toolUseId: event.toolUseId,
              startedAt: now,
            },
            now,
          );
        }
      }

      const workId = workItemId(event.toolUseId, ownerKey, event.toolName);
      return upsertWorkItem(
        next,
        {
          id: workId,
          nodeKey: ownerKey,
          kind: "tool",
          status,
          title: resolveNodeLabel(
            event.toolName,
            event.input,
            next.workItemsById[workId]?.title,
          ),
          toolUseId: event.toolUseId,
          startedAt: now,
        },
        now,
      );
    }

    case "subagent_progress": {
      // Progress is *about* a subagent, so it routes by spawn identity, not by
      // owner: `agentId` names it outright, and a bare `toolUseId` resolves
      // through the spawn index rather than being read as a node key of its
      // own.
      const key = event.agentId
        ? providerAgentNodeKey(graph.providerId, event.agentId)
        : event.toolUseId
          ? (graph.nodeKeyBySpawnToolUseId[event.toolUseId] ??
            toolCallNodeKey(event.toolUseId))
          : resolveOwnerKey(graph, event);
      const existing = graph.nodesByKey[key];
      const line = truncateWorkText(event.content);
      if (!line) {
        return graph;
      }
      return upsertNode(
        graph,
        key,
        {
          identitySource: event.agentId ? "provider" : "tool-call",
          agentId: event.agentId,
          spawnedByToolUseId: event.toolUseId,
          parentKey: existing?.parentKey ?? graph.rootKey,
          progress: appendProgress(existing?.progress ?? [], line),
        },
        now,
      );
    }

    default:
      return graph;
  }
}

/**
 * A work item id must be stable across the pending → running → completed
 * replays of the same call. `toolUseId` is that anchor when the provider sends
 * one; without it the call is only identifiable by who ran it and what it was,
 * which is coarser but still collapses a repeat rather than growing the list.
 */
function workItemId(
  toolUseId: string | undefined,
  ownerKey: string,
  toolName: string,
) {
  return toolUseId ? `tool:${toolUseId}` : `tool:${ownerKey}:${toolName}`;
}

/**
 * The emitting agent may never have been announced — Claude reports hook
 * activity from inside a subagent without a preceding spawn Stave saw. Naming
 * it here keeps its work attributed to it instead of silently collapsing into
 * the turn root.
 */
function ensureOwnerNode(graph: WorkGraph, ownerKey: string, now: number) {
  if (graph.nodesByKey[ownerKey]) {
    return graph;
  }
  return upsertNode(
    graph,
    ownerKey,
    { identitySource: "provider", parentKey: graph.rootKey },
    now,
  );
}

/**
 * Fold the run ledger's child tasks into the graph.
 *
 * Ledger nodes are not derived from provider events at all: Stave delegated
 * these children itself and holds their identity independently of whatever the
 * runtime says, which is exactly why Stage F's identity freeze had to land
 * before this could. The ledger is authoritative for them — phase, reason, and
 * lifetime all come from the delegation record, so a child keeps its place in
 * the graph after its parent turn's event stream has gone quiet.
 */
export function mergeChildTasksIntoWorkGraph(
  graph: WorkGraph,
  children: readonly ChildTaskSummary[],
  now: number,
): WorkGraph {
  let next = graph;
  for (const child of children) {
    next = upsertNode(
      next,
      ledgerNodeKey(child.delegationKey),
      {
        identitySource: "ledger",
        delegationKey: child.delegationKey,
        childTaskId: child.childTaskId,
        parentKey: next.rootKey,
        label: child.delegationKey,
        status: CHILD_PHASE_STATUS[child.phase] ?? "running",
        reason: child.reason ?? undefined,
        completedAt: child.completedAt
          ? Date.parse(child.completedAt)
          : undefined,
      },
      now,
    );
  }
  return next;
}

/**
 * Record that a node is waiting on a person, and the dependency that creates.
 *
 * A blocked node is the one case where a dependency is not reported by the
 * provider: the runtime says "running" for a child sitting on an unanswered
 * approval, so the edge has to come from the interaction. Without it the tree
 * shows a busy agent where a human is in fact the critical path.
 */
export function recordWorkGraphInteraction(
  graph: WorkGraph,
  interaction: Interaction,
  now: number,
): WorkGraph {
  const existing = graph.interactionsById[interaction.id];
  if (
    existing &&
    existing.resolvedAt === interaction.resolvedAt &&
    existing.nodeKey === interaction.nodeKey
  ) {
    return graph;
  }
  const withInteraction: WorkGraph = {
    ...graph,
    updatedAt: now,
    interactionsById: {
      ...graph.interactionsById,
      [interaction.id]: interaction,
    },
  };
  if (interaction.resolvedAt) {
    return withInteraction;
  }
  return recordDependency(
    withInteraction,
    {
      id: `blocked-on:${interaction.id}`,
      kind: "blocked-on",
      from: interaction.nodeKey,
      to: interaction.id,
    },
    now,
  );
}
