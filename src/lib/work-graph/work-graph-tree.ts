import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import {
  isTerminalWorkGraphStatus,
  type AgentNode,
  type WorkGraph,
  type WorkGraphStatus,
} from "./work-graph.types";

/**
 * How the graph reads on a screen: a depth-annotated tree for the Turn Activity
 * surface, a one-line summary for Fleet, and the rule that decides which
 * per-agent controls a node may offer.
 *
 * Pure and React-free on purpose — the ordering, the counts, and above all the
 * control-gating are the parts worth testing without a renderer.
 */

export interface WorkGraphTreeRow {
  key: string;
  depth: number;
  node: AgentNode;
  /** Work items owned by this node, in the order they were first seen. */
  workItemIds: string[];
  /** True while a person is the thing this node is waiting on. */
  blocked: boolean;
  /** True when this node has children, so the row can disclose them. */
  hasChildren: boolean;
}

/** Most urgent first, matching the flat activity shelf's vocabulary. */
const STATUS_ORDER: Record<WorkGraphStatus, number> = {
  failed: 0,
  waiting: 1,
  running: 2,
  pending: 3,
  completed: 4,
  cancelled: 5,
};

/**
 * Flatten the graph into display rows.
 *
 * Siblings sort by urgency and then by spawn order; the tree itself is walked
 * depth-first from the turn root so a child is always adjacent to its parent.
 * Two things the walk must not do: recurse into a node twice (a malformed
 * parent chain from a confused provider would otherwise hang the renderer), and
 * drop nodes whose parent never arrived — those are surfaced at the root, since
 * an agent shown in the wrong place is still better than one that vanished.
 */
export function buildWorkGraphTree(graph: WorkGraph): WorkGraphTreeRow[] {
  const childKeysByParent = new Map<string, string[]>();
  for (const key of graph.orderedNodeKeys) {
    const node = graph.nodesByKey[key];
    if (!node || key === graph.rootKey) {
      continue;
    }
    const parentKey =
      node.parentKey && graph.nodesByKey[node.parentKey]
        ? node.parentKey
        : graph.rootKey;
    const siblings = childKeysByParent.get(parentKey);
    if (siblings) {
      siblings.push(key);
    } else {
      childKeysByParent.set(parentKey, [key]);
    }
  }

  const blockedNodeKeys = new Set(
    Object.values(graph.interactionsById)
      .filter((interaction) => !interaction.resolvedAt)
      .map((interaction) => interaction.nodeKey),
  );

  const workItemIdsByNode = new Map<string, string[]>();
  for (const id of graph.orderedWorkItemIds) {
    const item = graph.workItemsById[id];
    if (!item) {
      continue;
    }
    const owned = workItemIdsByNode.get(item.nodeKey);
    if (owned) {
      owned.push(id);
    } else {
      workItemIdsByNode.set(item.nodeKey, [id]);
    }
  }

  const spawnOrder = new Map(
    graph.orderedNodeKeys.map((key, index) => [key, index] as const),
  );
  const rows: WorkGraphTreeRow[] = [];
  const visited = new Set<string>();

  const walk = (key: string, depth: number) => {
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    const node = graph.nodesByKey[key];
    if (!node) {
      return;
    }
    const children = childKeysByParent.get(key) ?? [];
    if (key !== graph.rootKey) {
      rows.push({
        key,
        depth: depth - 1,
        node,
        workItemIds: workItemIdsByNode.get(key) ?? [],
        blocked: blockedNodeKeys.has(key),
        hasChildren: children.length > 0,
      });
    }
    const sorted = [...children].sort((left, right) => {
      const leftNode = graph.nodesByKey[left];
      const rightNode = graph.nodesByKey[right];
      const byStatus =
        STATUS_ORDER[leftNode?.status ?? "completed"] -
        STATUS_ORDER[rightNode?.status ?? "completed"];
      if (byStatus !== 0) {
        return byStatus;
      }
      return (spawnOrder.get(left) ?? 0) - (spawnOrder.get(right) ?? 0);
    });
    for (const childKey of sorted) {
      walk(childKey, depth + 1);
    }
  };

  walk(graph.rootKey, 0);
  // Anything the walk could not reach — a parent cycle the reducer did not get
  // to re-root, or any other malformed chain — is surfaced at the top level
  // rather than dropped: an agent shown in the wrong place is still better
  // than one that vanished from both the tree and the Fleet count.
  for (const key of graph.orderedNodeKeys) {
    if (!visited.has(key) && key !== graph.rootKey) {
      walk(key, 1);
    }
  }
  return rows;
}

export interface WorkGraphSummary {
  /** Agents excluding the turn root. */
  totalCount: number;
  runningCount: number;
  blockedCount: number;
  failedCount: number;
  completedCount: number;
  /** Deepest nesting level present, 0 when the graph is flat. */
  maxDepth: number;
  /** One line for Fleet, e.g. `3 agents · 1 blocked`. */
  label: string;
}

/**
 * The compact Fleet line.
 *
 * Fleet shows many tasks at once, so this deliberately reports only what would
 * make someone open the task: how much is in flight, and whether anything is
 * stuck on them. A blocked agent leads because it is the only state a person
 * can act on from the list.
 */
export function summarizeWorkGraph(graph: WorkGraph): WorkGraphSummary {
  const rows = buildWorkGraphTree(graph);
  let running = 0;
  let blocked = 0;
  let failed = 0;
  let completed = 0;
  let maxDepth = 0;
  for (const row of rows) {
    maxDepth = Math.max(maxDepth, row.depth);
    if (row.blocked) {
      blocked += 1;
      continue;
    }
    if (row.node.status === "failed") {
      failed += 1;
    } else if (isTerminalWorkGraphStatus(row.node.status)) {
      completed += 1;
    } else {
      running += 1;
    }
  }
  const totalCount = rows.length;
  const parts: string[] = [];
  if (totalCount > 0) {
    parts.push(`${totalCount} ${totalCount === 1 ? "agent" : "agents"}`);
  }
  if (blocked > 0) {
    parts.push(`${blocked} blocked`);
  }
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  return {
    totalCount,
    runningCount: running,
    blockedCount: blocked,
    failedCount: failed,
    completedCount: completed,
    maxDepth,
    label: parts.join(" · ") || "No agents",
  };
}

export type WorkGraphControl = "message" | "interrupt" | "stop";

export interface WorkGraphControlAvailability {
  available: WorkGraphControl[];
  /**
   * Why nothing is offered, phrased for a tooltip. Present exactly when
   * `available` is empty, so a disabled control always explains itself instead
   * of leaving the reader to guess whether it is broken.
   */
  reason?: string;
}

/**
 * Which controls this node may offer right now.
 *
 * Three gates, all of which must pass, and each of which fails closed:
 *
 * 1. **Identity.** A node whose identity came from a bare tool call names no
 *    worker to address. Offering it a Stop would either do nothing or cancel
 *    the whole turn — both are worse than no button.
 * 2. **Liveness.** The node must still be present in the turn's live identity
 *    set. A control prepared against an agent that has since exited is the
 *    stale-turn problem Stage F froze identity to prevent, and it is rejected
 *    here rather than at the runtime.
 * 3. **Ownership.** A ledger-owned child is Stave's, not the runtime's: it is a
 *    task with a workspace and a run of its own, steered through the child-task
 *    coordinator against the identity Stage F froze. Its controls therefore do
 *    not depend on what the provider can do to its own in-process subagents,
 *    and gating them on a runtime capability would hide a control that works.
 * 4. **Capability.** For a provider-owned agent the runtime must actually
 *    implement per-agent steering. None does today, which is precisely why this
 *    is a declared capability and not an assumption — when one ships, only its
 *    capability flags change.
 */
export function resolveWorkGraphControls(args: {
  node: AgentNode;
  capabilities: ProviderWorkGraphCapabilities;
  /** Agent/delegation identities the turn currently reports as live. */
  liveIdentities: ReadonlySet<string>;
}): WorkGraphControlAvailability {
  const { node, capabilities, liveIdentities } = args;
  if (node.identitySource === "tool-call") {
    return {
      available: [],
      reason:
        "This provider does not name the agent behind this call, so it cannot be steered on its own.",
    };
  }
  if (isTerminalWorkGraphStatus(node.status)) {
    return { available: [], reason: "This agent has already finished." };
  }
  const identity = node.delegationKey ?? node.agentId;
  if (!identity || !liveIdentities.has(identity)) {
    return {
      available: [],
      reason: "This agent is no longer running in the current turn.",
    };
  }
  if (node.identitySource === "ledger") {
    // Stop only: it is the one control that needs nothing from the person
    // beyond the decision. A follow-up is a prompt, and the child task row
    // below already owns the composer for writing one.
    return { available: ["stop"] };
  }
  const available: WorkGraphControl[] = [];
  if (capabilities.message) {
    available.push("message");
  }
  if (capabilities.interrupt) {
    available.push("interrupt");
  }
  if (capabilities.stop) {
    available.push("stop");
  }
  if (available.length === 0) {
    return {
      available,
      reason: "This provider cannot steer one agent without ending the turn.",
    };
  }
  return { available };
}

/**
 * The identities a turn currently has running.
 *
 * Derived from the graph rather than tracked separately so the liveness check
 * and the rendered tree can never disagree — a node the tree draws as finished
 * is, by construction, absent here.
 */
export function collectLiveWorkGraphIdentities(graph: WorkGraph) {
  const live = new Set<string>();
  for (const key of graph.orderedNodeKeys) {
    const node = graph.nodesByKey[key];
    if (!node || key === graph.rootKey) {
      continue;
    }
    if (isTerminalWorkGraphStatus(node.status)) {
      continue;
    }
    const identity = node.delegationKey ?? node.agentId;
    if (identity) {
      live.add(identity);
    }
  }
  return live;
}
