import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * The vocabulary of the work graph: who is working (`AgentNode`), what they are
 * doing (`WorkItem`), what waits on what (`Dependency`), and what they need
 * from a person (`Interaction`).
 *
 * This module is types and key constructors only — no reducer, no provider
 * imports beyond the id union, no clock. The reducer in
 * `work-graph-reducer.ts` is the only thing allowed to build these, and the
 * projection in `work-graph-tree.ts` is the only thing allowed to shape them
 * for a screen. Keeping the keys here means the two can never disagree about
 * what identifies a node.
 */

export type WorkGraphStatus =
  "pending" | "running" | "waiting" | "completed" | "failed" | "cancelled";

/**
 * Where a node's identity came from, and therefore how much the graph is
 * allowed to claim about it.
 *
 * This is not decoration: it decides whether a control may be offered. Only
 * `ledger` and `provider` nodes name a worker that outlives the call that
 * spawned it, so only they can be addressed by a message/interrupt/stop. A
 * `tool-call` node is the honest fallback for a provider that reports a
 * delegating call and never names the agent behind it — the graph shows the
 * work but refuses to pretend the tool-use id is an agent, because targeting a
 * control at it would either miss or hit the whole turn.
 */
export type WorkGraphIdentitySource = "ledger" | "provider" | "tool-call";

/** Node key namespaces. Kept distinct so two sources can never collide. */
const NODE_KEY_PREFIX = {
  turn: "turn",
  ledger: "ledger",
  provider: "agent",
  toolCall: "call",
} as const;

/**
 * Keys are opaque to every consumer — parse them nowhere, compare them
 * everywhere. The separator is escaped out of the payload so a provider id
 * containing one cannot forge another namespace's key.
 */
function encodeKeySegment(value: string) {
  return value.replace(/[\\:]/g, (match) => `\\${match}`);
}

/** The turn itself: the root every unparented node hangs from. */
export function turnNodeKey(turnId: string) {
  return `${NODE_KEY_PREFIX.turn}:${encodeKeySegment(turnId)}`;
}

/**
 * A child task Stave delegated and owns on the run ledger. Keyed by the
 * delegation key rather than the child task id because the delegation key is
 * what Stage F froze as the parent's handle on the child: it survives retries
 * that mint a new child task id, so a retried child stays the same node instead
 * of forking the graph.
 */
export function ledgerNodeKey(delegationKey: string) {
  return `${NODE_KEY_PREFIX.ledger}:${encodeKeySegment(delegationKey)}`;
}

/**
 * An agent the provider named. Namespaced by provider id because agent ids are
 * only unique within a runtime, and a task can carry events from more than one
 * over its life.
 */
export function providerAgentNodeKey(providerId: ProviderId, agentId: string) {
  return `${NODE_KEY_PREFIX.provider}:${encodeKeySegment(
    providerId,
  )}:${encodeKeySegment(agentId)}`;
}

/**
 * Fallback for a delegating tool call whose agent identity never arrived. The
 * `call:` namespace is deliberate: it reads as "this is a call, not an agent"
 * at every call site, so nothing downstream can accidentally treat it as
 * steerable identity.
 */
export function toolCallNodeKey(toolUseId: string) {
  return `${NODE_KEY_PREFIX.toolCall}:${encodeKeySegment(toolUseId)}`;
}

export interface AgentNode {
  key: string;
  identitySource: WorkGraphIdentitySource;
  /** Provider-owned identity, when the provider named this agent. */
  agentId?: string;
  /** Ledger-owned identity, when Stave delegated this child. */
  delegationKey?: string;
  /** The child task this node runs as, for ledger-owned nodes. */
  childTaskId?: string;
  /**
   * Ledger attempt number, for ledger-owned nodes.
   *
   * Kept on the node because a retry reuses the delegation key — which is the
   * node's identity — so the attempt is the only thing that distinguishes "this
   * child failed" from "this child failed once and is running again".
   */
  attempt?: number;
  /** The tool call that spawned this agent, when known. */
  spawnedByToolUseId?: string;
  /**
   * Parent node key, or `null` for a node attached directly to the turn.
   *
   * `null` means "top level", never "parent unknown". A provider that does not
   * report nesting produces a flat graph of top-level nodes, which is a true
   * statement about what Stave knows; inventing a parent from timing would draw
   * an edge nobody reported.
   */
  parentKey: string | null;
  label: string;
  /** Subagent flavor (`Explore`, `Plan`, …) when the spawn named one. */
  badge?: string;
  status: WorkGraphStatus;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  /** Tail of the node's progress narration, oldest first. */
  progress: string[];
  /** Why the node ended, when it ended badly or was cancelled. */
  reason?: string;
}

export type WorkItemKind = "tool" | "hook" | "delegation";

/** One unit of work performed by a node — a tool call, a hook, a spawn. */
export interface WorkItem {
  id: string;
  /** The node that performed this work. */
  nodeKey: string;
  kind: WorkItemKind;
  status: WorkGraphStatus;
  title: string;
  detail?: string;
  toolUseId?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * `from` cannot progress until `to` settles.
 *
 * Only `spawn` edges are ever recorded from provider events today: they are the
 * one dependency a runtime actually reports. `blocked-on` exists because a node
 * waiting on a human is a dependency the surface must be able to draw, and it
 * comes from the interaction, not from the provider's event stream.
 */
export type DependencyKind = "spawn" | "blocked-on";

export interface Dependency {
  id: string;
  kind: DependencyKind;
  from: string;
  to: string;
}

export type InteractionKind = "approval" | "user-input";

/** Something a node needs from a person before it can continue. */
export interface Interaction {
  id: string;
  nodeKey: string;
  kind: InteractionKind;
  title: string;
  raisedAt: number;
  resolvedAt?: number;
}

/**
 * The whole graph for one turn.
 *
 * Stored as records plus an insertion-ordered key list for the same reason the
 * turn activity snapshot is: the reducer runs on every provider event, and
 * rebuilding arrays per event would make a hot path quadratic. `orderedNodeKeys`
 * is spawn order, which is the only ordering the provider actually tells us;
 * every display ordering is derived in the projection.
 */
export interface WorkGraph {
  turnId: string;
  providerId: ProviderId;
  rootKey: string;
  startedAt: number;
  updatedAt: number;
  nodesByKey: Record<string, AgentNode>;
  orderedNodeKeys: string[];
  workItemsById: Record<string, WorkItem>;
  orderedWorkItemIds: string[];
  dependenciesById: Record<string, Dependency>;
  interactionsById: Record<string, Interaction>;
  /**
   * Nodes whose parent was reported but has not arrived yet, keyed by the
   * missing parent key. Late and out-of-order events are the normal case for a
   * streamed graph, so an orphan is parked here and adopted when its parent
   * shows up, rather than being silently reparented to the root and left there.
   */
  pendingChildKeysByParentKey: Record<string, string[]>;
  /**
   * Spawning tool-use id → the node it spawned.
   *
   * Materialized rather than derived because it is read on every event to
   * resolve `parentToolUseId` and to route `subagent_progress` that carries no
   * agent id. Scanning the node table for each of those would make a hot path
   * quadratic in fan-out.
   */
  nodeKeyBySpawnToolUseId: Record<string, string>;
}

export const WORK_GRAPH_PROGRESS_LIMIT = 6;
/** Hard cap on nodes per turn, so a runaway fan-out cannot unbound the store. */
export const WORK_GRAPH_NODE_LIMIT = 200;
/** Hard cap on work items per turn, for the same reason. */
export const WORK_GRAPH_WORK_ITEM_LIMIT = 500;
/**
 * Hard cap on interactions per turn. Every approval and user-input prompt mints
 * a unique request id, so without a ceiling a turn that prompts in a loop grows
 * `interactionsById` for as long as it runs. The graph lives in the store for
 * the whole turn, so each of its maps needs a bound the way nodes and work
 * items already have one.
 */
export const WORK_GRAPH_INTERACTION_LIMIT = 200;
/**
 * Hard cap on `nodeKeyBySpawnToolUseId` entries per turn. Nodes are capped, but
 * many spawning calls (each with a fresh tool-use id) can point at one node —
 * a delegation retried in a loop, a replayed stream — so the index needs its
 * own ceiling to stay bounded within a long turn.
 */
export const WORK_GRAPH_SPAWN_INDEX_LIMIT = 500;

export function isTerminalWorkGraphStatus(status: WorkGraphStatus) {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}
