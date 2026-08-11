import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  isSubagentToolName,
  parseToolInput,
  resolveSubagentBadge,
  resolveToolTitle,
  truncateWorkText,
} from "@/lib/providers/subagent-identity";
import {
  isActiveChildTaskPhase,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";
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

/**
 * What to call a delegated child task.
 *
 * Deliberately not `resolveToolTitle`: that would fall back to the tool's own
 * display name, and every child in the turn would then be called "Delegate to
 * child task". The delegation key is a worse name than a title but a true one,
 * and it is what every other surface calls this child.
 */
function resolveDelegatedChildLabel(
  input: string,
  delegationKey: string,
  existingLabel: string | undefined,
) {
  if (existingLabel && existingLabel !== UNNAMED_AGENT_LABEL) {
    return existingLabel;
  }
  const parsed = parseToolInput(input);
  return truncateWorkText(parsed?.title) ?? delegationKey;
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
 *
 * Every member of `RunStatusSchema` must appear. A missing phase does not fail
 * loudly — it falls through to "running", which for a settled child means a row
 * that never finishes, stays counted as live, and keeps offering a Stop for a
 * task that already ended.
 */
const CHILD_PHASE_STATUS: Record<ChildTaskSummary["phase"], WorkGraphStatus> = {
  pending: "pending",
  running: "running",
  waiting: "waiting",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  // The ledger's "interrupted" is a run that was cut off rather than one that
  // failed on its own terms; `cancelled` is the graph's word for that.
  interrupted: "cancelled",
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

function mergeProgress(earlier: string[], later: string[]) {
  return later.reduce(
    (acc, line) => appendProgress(acc, line),
    earlier.slice(),
  );
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
    /**
     * This patch is a queried snapshot of the record that owns the node, not a
     * replayed provider event.
     *
     * The terminal-status guard and the "absent means unchanged" merge both
     * exist to survive a stream that repeats and reorders itself. A ledger read
     * has neither problem: it is the source of truth for the child, answered on
     * demand. Applying the guard to it is what pinned a retried child to the
     * previous attempt's failure — the delegation key is unchanged by design,
     * so the node was already terminal when the new attempt arrived.
     */
    authoritative?: boolean;
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
      attempt: patch.attempt,
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

  const status = patch.authoritative
    ? (patch.status ?? existing.status)
    : advanceStatus(existing.status, patch.status);
  const next: AgentNode = {
    ...existing,
    agentId: patch.agentId ?? existing.agentId,
    delegationKey: patch.delegationKey ?? existing.delegationKey,
    childTaskId: patch.childTaskId ?? existing.childTaskId,
    attempt: patch.attempt ?? existing.attempt,
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
    // An authoritative patch replaces rather than falls back: a child that is
    // running again has no completion time and no failure reason, and carrying
    // the previous attempt's forward would describe a run that is over.
    completedAt: patch.authoritative
      ? patch.completedAt
      : (patch.completedAt ??
        (isTerminalWorkGraphStatus(status) && !existing.completedAt
          ? now
          : existing.completedAt)),
    progress: patch.progress ?? existing.progress,
    reason: patch.authoritative
      ? patch.reason
      : (patch.reason ?? existing.reason),
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
    previous.attempt === next.attempt &&
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

/**
 * Rekey a node that was only ever a call onto the worker the provider has since
 * named.
 *
 * Claude reports the spawn before it reports the worker: the `Task` tool call
 * arrives carrying nothing but a tool-use id, and the `task_id` that names the
 * agent only appears on the first progress message. Adding a second node then
 * would draw one worker twice — once as the call that started it, once as the
 * agent it became — and the visible half would be the call, which is precisely
 * the half no control may target.
 *
 * So the call node *becomes* the agent node: same row, same place in spawn
 * order, same progress, now with an identity. Every reference to the old key is
 * repointed in the same pass, because a dangling parent or work-item key does
 * not error — it silently drops rows out of the tree.
 */
function resolvePromotedParentKey(args: {
  parentKey: string | null;
  providerKey: string;
  rootKey: string;
}) {
  return args.parentKey === args.providerKey ? args.rootKey : args.parentKey;
}

function promoteToolCallNode(args: {
  graph: WorkGraph;
  callKey: string;
  providerKey: string;
  agentId: string;
  now: number;
}): WorkGraph {
  const { graph, callKey, providerKey, agentId, now } = args;
  const callNode = graph.nodesByKey[callKey];
  if (!callNode || callKey === providerKey) {
    return graph;
  }
  const existing = graph.nodesByKey[providerKey];
  const promoted: AgentNode = {
    key: providerKey,
    identitySource: "provider",
    agentId,
    delegationKey: existing?.delegationKey ?? callNode.delegationKey,
    childTaskId: existing?.childTaskId ?? callNode.childTaskId,
    attempt: existing?.attempt ?? callNode.attempt,
    spawnedByToolUseId:
      callNode.spawnedByToolUseId ?? existing?.spawnedByToolUseId,
    // Rekeying can collapse a parent and its child onto one key if the runtime
    // ever named a call after the agent that made it. That is a provider bug,
    // but a self-parented node is a tree that cannot be drawn, so it re-roots.
    parentKey: resolvePromotedParentKey({
      parentKey: existing?.parentKey ?? callNode.parentKey,
      providerKey,
      rootKey: graph.rootKey,
    }),
    // The call node holds the spawn's description; a node materialized from a
    // bare agent id holds only the placeholder. Whichever actually says
    // something wins, and the call's own label loses to a real one.
    label:
      existing && existing.label !== UNNAMED_AGENT_LABEL
        ? existing.label
        : callNode.label,
    badge: existing?.badge ?? callNode.badge,
    // A result may already have settled the call while the agent node was still
    // reporting progress. Terminal wins either way: the work is over.
    status: isTerminalWorkGraphStatus(callNode.status)
      ? callNode.status
      : (existing?.status ?? callNode.status),
    startedAt: Math.min(
      callNode.startedAt,
      existing?.startedAt ?? callNode.startedAt,
    ),
    updatedAt: now,
    completedAt: callNode.completedAt ?? existing?.completedAt,
    // Both halves narrated the same worker, so neither tail is discarded: the
    // call's lines were collected first, before anything named the agent.
    progress: existing?.progress.length
      ? mergeProgress(callNode.progress, existing.progress)
      : callNode.progress,
    reason: callNode.reason ?? existing?.reason,
  };

  const { [callKey]: _replaced, ...restNodes } = graph.nodesByKey;
  const nodesByKey: Record<string, AgentNode> = { ...restNodes };
  for (const [key, node] of Object.entries(nodesByKey)) {
    if (node.parentKey === callKey) {
      nodesByKey[key] = { ...node, parentKey: providerKey, updatedAt: now };
    }
  }
  nodesByKey[providerKey] = promoted;

  const orderedNodeKeys = existing
    ? graph.orderedNodeKeys.filter((key) => key !== callKey)
    : graph.orderedNodeKeys.map((key) => (key === callKey ? providerKey : key));

  const workItemsById: Record<string, WorkItem> = {};
  for (const [id, item] of Object.entries(graph.workItemsById)) {
    workItemsById[id] =
      item.nodeKey === callKey ? { ...item, nodeKey: providerKey } : item;
  }

  const dependenciesById: Record<string, Dependency> = {};
  for (const dependency of Object.values(graph.dependenciesById)) {
    const from = dependency.from === callKey ? providerKey : dependency.from;
    const to = dependency.to === callKey ? providerKey : dependency.to;
    if (from === to) {
      continue;
    }
    const id =
      dependency.kind === "spawn" ? `spawn:${from}->${to}` : dependency.id;
    dependenciesById[id] = { ...dependency, id, from, to };
  }

  const interactionsById: Record<string, Interaction> = {};
  for (const [id, interaction] of Object.entries(graph.interactionsById)) {
    interactionsById[id] =
      interaction.nodeKey === callKey
        ? { ...interaction, nodeKey: providerKey }
        : interaction;
  }

  const pendingChildKeysByParentKey: Record<string, string[]> = {};
  for (const [parentKey, childKeys] of Object.entries(
    graph.pendingChildKeysByParentKey,
  )) {
    const target = parentKey === callKey ? providerKey : parentKey;
    const merged = new Set(pendingChildKeysByParentKey[target] ?? []);
    for (const key of childKeys) {
      merged.add(key === callKey ? providerKey : key);
    }
    merged.delete(target);
    pendingChildKeysByParentKey[target] = [...merged];
  }

  const nodeKeyBySpawnToolUseId: Record<string, string> = {};
  for (const [toolUseId, nodeKey] of Object.entries(
    graph.nodeKeyBySpawnToolUseId,
  )) {
    nodeKeyBySpawnToolUseId[toolUseId] =
      nodeKey === callKey ? providerKey : nodeKey;
  }

  const promotedGraph: WorkGraph = {
    ...graph,
    updatedAt: now,
    nodesByKey,
    orderedNodeKeys,
    workItemsById,
    dependenciesById,
    interactionsById,
    pendingChildKeysByParentKey,
    nodeKeyBySpawnToolUseId,
  };
  // The promoted node may be the parent a queued orphan was waiting for under
  // its new key, so the park list gets another chance to drain.
  return adoptPendingChildren(promotedGraph, providerKey, now);
}

/**
 * Promote the call this event names, when the event finally names the agent
 * behind it. A no-op for every provider that gets identity right the first
 * time, and for every event after the first that carries both ids.
 */
function bindSpawnedAgentIdentity(args: {
  graph: WorkGraph;
  toolUseId: string | undefined;
  agentId: string | undefined;
  now: number;
}): WorkGraph {
  const { graph, toolUseId, agentId, now } = args;
  if (!toolUseId || !agentId) {
    return graph;
  }
  const callKey = graph.nodeKeyBySpawnToolUseId[toolUseId];
  if (!callKey || graph.nodesByKey[callKey]?.identitySource !== "tool-call") {
    return graph;
  }
  return promoteToolCallNode({
    graph,
    callKey,
    providerKey: providerAgentNodeKey(graph.providerId, agentId),
    agentId,
    now,
  });
}

/**
 * The Local MCP call a task makes to delegate durable work to a child task.
 *
 * Matched by suffix because each runtime prefixes MCP tools its own way
 * (`mcp__stave-local-mcp__…` for Claude), and the delegation key travels in the
 * call's own input — it is the handle Stage F froze, so reading it here is what
 * lets a ledger-owned child hang off the agent that actually delegated it
 * instead of floating at the turn root.
 */
const DELEGATION_TOOL_NAME_SUFFIX = "stave_delegate_task";

/**
 * Why a delegation never happened, from the delegating call's own result.
 *
 * The coordinator can refuse before any ledger row exists — an unavailable
 * workspace, a concurrency limit, a request it will not honor — and the MCP
 * tool reports that as an ordinary successful call carrying a refusal. Nothing
 * else can correct the node in that case: the ledger has no row to list, so the
 * child would sit "pending" for the life of the turn, counted as a live agent
 * and offering a Stop for a task that was never started.
 *
 * Returns undefined unless the result explicitly says the delegation was
 * refused. An unparseable result is left alone rather than guessed at, because
 * the ledger is still the better authority whenever it has anything to say.
 */
function resolveDelegationRefusal(event: {
  output: string;
  isError?: boolean;
}) {
  if (event.isError) {
    return truncateWorkText(event.output) ?? "The delegation was refused.";
  }
  const parsed = parseToolInput(event.output);
  const delegation =
    parsed && typeof parsed.delegation === "object" && parsed.delegation
      ? (parsed.delegation as Record<string, unknown>)
      : null;
  if (!delegation || delegation.accepted !== false) {
    return undefined;
  }
  return (
    truncateWorkText(delegation.message) ??
    truncateWorkText(delegation.reason) ??
    "The delegation was refused."
  );
}

function resolveDelegationKeyFromTool(toolName: string, input: string) {
  if (!toolName.endsWith(DELEGATION_TOOL_NAME_SUFFIX)) {
    return undefined;
  }
  const parsed = parseToolInput(input);
  const key = parsed?.delegationKey;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

export function reduceWorkGraphEvent(
  graph: WorkGraph,
  event: NormalizedProviderEvent,
  now: number,
): WorkGraph {
  switch (event.type) {
    case "tool": {
      const bound = bindSpawnedAgentIdentity({
        graph,
        toolUseId: event.toolUseId,
        agentId: event.agentId,
        now,
      });
      const ownerKey = resolveOwnerKey(bound, event);
      let next = ensureOwnerNode(bound, ownerKey, now);
      const status = TOOL_STATE_STATUS[event.state];

      const delegationKey = resolveDelegationKeyFromTool(
        event.toolName,
        event.input,
      );
      if (delegationKey) {
        const nodeKey = ledgerNodeKey(delegationKey);
        const existingChild = next.nodesByKey[nodeKey];
        next = upsertNode(
          next,
          nodeKey,
          {
            identitySource: "ledger",
            delegationKey,
            spawnedByToolUseId: event.toolUseId,
            parentKey: ownerKey,
            label: resolveDelegatedChildLabel(
              event.input,
              delegationKey,
              existingChild?.label,
            ),
            // The call returns the moment the delegation is recorded, so its
            // own tool state says nothing about the child. The ledger owns this
            // node from here; until it answers, the child is merely queued.
            ...(existingChild ? {} : { status: "pending" as const }),
          },
          now,
        );
        if (event.toolUseId && !next.nodeKeyBySpawnToolUseId[event.toolUseId]) {
          next = {
            ...next,
            nodeKeyBySpawnToolUseId: {
              ...next.nodeKeyBySpawnToolUseId,
              [event.toolUseId]: nodeKey,
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
            title: next.nodesByKey[nodeKey]?.label ?? "Delegated work",
            toolUseId: event.toolUseId,
            startedAt: now,
          },
          now,
        );
      }

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

    case "tool_result": {
      // A partial result is a chunk of output, not an ending. Settling on one
      // would retire a node that is still working.
      if (event.isPartial) {
        return graph;
      }
      const status: WorkGraphStatus = event.isError ? "failed" : "completed";
      let next = graph;
      const item = next.workItemsById[`tool:${event.tool_use_id}`];
      if (item) {
        next = upsertWorkItem(next, { ...item, status }, now);
      }
      const spawnedKey = next.nodeKeyBySpawnToolUseId[event.tool_use_id];
      const spawned = spawnedKey ? next.nodesByKey[spawnedKey] : undefined;
      if (!spawned || !spawnedKey) {
        return next;
      }
      // A ledger-owned child outlives the call that delegated it: the MCP call
      // returns as soon as the delegation is recorded, while the child task
      // runs on. Only the ledger may end that node — except when there is no
      // ledger row to end it, because the delegation was refused.
      if (spawned.identitySource === "ledger") {
        const refusal = resolveDelegationRefusal(event);
        return refusal
          ? upsertNode(
              next,
              spawnedKey,
              {
                identitySource: "ledger",
                authoritative: true,
                status: "failed",
                reason: refusal,
              },
              now,
            )
          : next;
      }
      return upsertNode(
        next,
        spawnedKey,
        {
          identitySource: spawned.identitySource,
          status,
          // Only when this result is what ends the node. A call that already
          // completed keeps that ending, and pinning a failure reason to it
          // would label a finished row with an error it did not have.
          ...(status === "failed" &&
          !isTerminalWorkGraphStatus(spawned.status)
            ? { reason: truncateWorkText(event.output) }
            : {}),
        },
        now,
      );
    }

    case "subagent_progress": {
      // Progress is *about* a subagent, so it routes by spawn identity, not by
      // owner: `agentId` names it outright, and a bare `toolUseId` resolves
      // through the spawn index rather than being read as a node key of its
      // own.
      const line = truncateWorkText(event.content);
      if (!line) {
        return graph;
      }
      const bound = bindSpawnedAgentIdentity({
        graph,
        toolUseId: event.toolUseId,
        agentId: event.agentId,
        now,
      });
      const key = event.agentId
        ? providerAgentNodeKey(bound.providerId, event.agentId)
        : event.toolUseId
          ? (bound.nodeKeyBySpawnToolUseId[event.toolUseId] ??
            toolCallNodeKey(event.toolUseId))
          : resolveOwnerKey(bound, event);
      const existing = bound.nodesByKey[key];
      return upsertNode(
        bound,
        key,
        {
          identitySource:
            existing?.identitySource ??
            (event.agentId ? "provider" : "tool-call"),
          agentId: event.agentId,
          spawnedByToolUseId: event.toolUseId,
          parentKey: existing?.parentKey ?? bound.rootKey,
          progress: appendProgress(existing?.progress ?? [], line),
        },
        now,
      );
    }

    case "approval": {
      const ownerKey = resolveOwnerKey(graph, event);
      return recordWorkGraphInteraction(
        ensureOwnerNode(graph, ownerKey, now),
        {
          id: approvalInteractionId(event.requestId),
          nodeKey: ownerKey,
          kind: "approval",
          title:
            truncateWorkText(event.description) ??
            truncateWorkText(event.toolName) ??
            "Approval needed",
          raisedAt: now,
        },
        now,
      );
    }

    case "user_input": {
      const ownerKey = resolveOwnerKey(graph, event);
      return recordWorkGraphInteraction(
        ensureOwnerNode(graph, ownerKey, now),
        {
          id: userInputInteractionId(event.requestId),
          nodeKey: ownerKey,
          kind: "user-input",
          title:
            truncateWorkText(event.questions[0]?.question) ??
            "Question for you",
          raisedAt: now,
        },
        now,
      );
    }

    case "done":
      // The turn is over, so nothing in it is still waiting on a person. Left
      // open, an unanswered prompt would keep its node badged "Needs you" for
      // as long as the finished turn stayed on screen.
      return resolveWorkGraphInteractions(graph, now);

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
 *
 * Scoped on purpose, because the listing a parent reads is its whole delegation
 * history while a graph is one turn. A child already in the graph was put there
 * by this turn's delegating call and keeps the position that call gave it —
 * under the agent that delegated it, not at the root. A child the graph has
 * never seen joins only while it is still running, which covers the two cases
 * where the call is not in the graph to be recognized: a runtime whose MCP
 * input Stave cannot parse, and a turn adopted mid-flight from persistence,
 * whose earlier events were never replayed. A child that has already ended and
 * that this turn never delegated belongs to an earlier turn, and is left to the
 * child task list.
 *
 * Deliberately not a timestamp comparison. `startedAt` is when Stave began
 * *watching* the turn, not when the turn began — adopting a restored turn
 * stamps it with the adoption — and a child's `createdAt` is its run's, which a
 * retry reuses. Both make a clock-based rule quietly drop live children.
 */
export function mergeChildTasksIntoWorkGraph(
  graph: WorkGraph,
  children: readonly ChildTaskSummary[],
  now: number,
): WorkGraph {
  let next = graph;
  for (const child of children) {
    const key = ledgerNodeKey(child.delegationKey);
    const existing = next.nodesByKey[key];
    if (!existing && !isActiveChildTaskPhase(child.phase)) {
      continue;
    }
    next = upsertNode(
      next,
      key,
      {
        identitySource: "ledger",
        authoritative: true,
        delegationKey: child.delegationKey,
        childTaskId: child.childTaskId,
        attempt: child.attempt,
        parentKey: existing?.parentKey ?? next.rootKey,
        label: resolveDelegatedChildLabel(
          "",
          child.delegationKey,
          existing?.label,
        ),
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
function recordWorkGraphInteraction(
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

/** The graph's id for the prompt a provider knows by `requestId`. */
export function approvalInteractionId(requestId: string) {
  return `approval:${requestId}`;
}

export function userInputInteractionId(requestId: string) {
  return `user-input:${requestId}`;
}

/**
 * The person answered, or the turn ended: nothing is waiting on a human now.
 *
 * Resolution is not something the provider reports — an approval is answered
 * through Stave, and the runtime simply carries on — so the graph would never
 * clear a block on its own.
 *
 * `interactionId` scopes it to the prompt that was actually answered. Both
 * runtimes hold pending approvals in a map and can have several open at once,
 * one per subagent; clearing them together would drop the "Needs you" badge off
 * a worker whose question is still on screen unanswered, and nothing would ever
 * raise it again. Omitting the id is for the one case where the whole set truly
 * settles at once: the turn is over.
 */
export function resolveWorkGraphInteractions(
  graph: WorkGraph,
  now: number,
  interactionId?: string,
): WorkGraph {
  const open = Object.values(graph.interactionsById).filter(
    (interaction) =>
      !interaction.resolvedAt &&
      (!interactionId || interaction.id === interactionId),
  );
  if (open.length === 0) {
    return graph;
  }
  const interactionsById = { ...graph.interactionsById };
  const dependenciesById = { ...graph.dependenciesById };
  for (const interaction of open) {
    interactionsById[interaction.id] = { ...interaction, resolvedAt: now };
    delete dependenciesById[`blocked-on:${interaction.id}`];
  }
  return { ...graph, updatedAt: now, interactionsById, dependenciesById };
}
