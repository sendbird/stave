import { isRepositoryMemoryStale, type RepositoryMemory } from "../repository-memory";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "./branch-name";
import type { TarsConversationSettings } from "./conversation";
import { TARS_IDENTITY_UNSAVED_AT, isTarsDefaultInstructions } from "./default-instructions";
import type { TarsIdentity } from "./types";

/**
 * What Tars carries from one message to the next, as the planner and the
 * hosts actually read it (`tars-planner.ts`, `tars-context.ts`,
 * `tars-host.ts`, `local-mcp-runtime.ts`):
 *
 * - everywhere: the standing instructions (the planner's `preferences` on
 *   every message, and the `standards` of every agent it starts) and the
 *   saved agents it may hand work to (built-in agents are always allowed);
 * - per repository: its branch naming rule (the planner's inventory), and its
 *   repository memories, which the planner itself never reads: the tasks Tars
 *   starts in that repository receive the relevant ones at each turn.
 *
 * It keeps nothing else. Of the conversation, each message rereads only the
 * last `TARS_PLANNER_HISTORY_MESSAGES` messages; no memory is written from it.
 */

/** Earlier messages of the conversation the planner rereads with each message. */
export const TARS_PLANNER_HISTORY_MESSAGES = 8;
/** Registered repositories the planner's inventory lists; the rest are only counted. */
export const TARS_PLANNER_MAX_REPOSITORIES = 12;

/** Who an item's current value comes from: the user's own text, Stave's default, or nothing set. */
export type TarsKnowledgeSource = "you" | "default" | "none";

export interface TarsKnowledgeInstructions {
  kind: "instructions";
  text: string;
  source: TarsKnowledgeSource;
  /** When the identity that holds them was last saved; null when it never was. */
  changedAt: string | null;
  /** The existing editor that changes it. */
  editor: "tarsSettings";
}

export interface TarsKnowledgeAgents {
  kind: "agents";
  /** The saved agents the user allowed, by display name. */
  allowed: Array<{ id: string; name: string }>;
  /** Allowed ids whose agent no longer exists. */
  missing: string[];
  source: Exclude<TarsKnowledgeSource, "default">;
  editor: "tarsSettings";
}

export interface TarsKnowledgeBranchRule {
  kind: "branchRule";
  text: string;
  source: Exclude<TarsKnowledgeSource, "none">;
  editor: "repositorySettings";
}

export interface TarsKnowledgeRepository {
  repositoryPath: string;
  name: string;
  branchRule: TarsKnowledgeBranchRule;
}

export interface TarsKnowledge {
  everywhere: { instructions: TarsKnowledgeInstructions; agents: TarsKnowledgeAgents };
  repositories: TarsKnowledgeRepository[];
  /** Registered repositories beyond what the planner's inventory lists. */
  omittedRepositories: number;
}

/**
 * Groups what Tars knows by where it applies. `defaults` are the offered
 * default instructions in every language, so the default reads as Stave's in
 * either one. `agentNameOf` returns null for an agent that no longer exists.
 */
export function buildTarsKnowledge(args: {
  identity: Pick<TarsIdentity, "instructions" | "updatedAt">;
  defaults: readonly string[];
  settings: Pick<TarsConversationSettings, "allowedAgentIds"> | null;
  agentNameOf: (id: string) => string | null;
  repositories: ReadonlyArray<{ repositoryPath: string; repositoryName: string; kickoffBranchNamingRule?: string | null }>;
}): TarsKnowledge {
  const text = args.identity.instructions.trim();
  const allowedIds = args.settings?.allowedAgentIds ?? [];
  const allowed: TarsKnowledgeAgents["allowed"] = [];
  const missing: string[] = [];
  for (const id of allowedIds) {
    const name = args.agentNameOf(id);
    if (name === null) missing.push(id); else allowed.push({ id, name });
  }
  const listed = args.repositories.slice(0, TARS_PLANNER_MAX_REPOSITORIES);
  return {
    everywhere: {
      instructions: { kind: "instructions", text, source: !text ? "none" : isTarsDefaultInstructions(text, args.defaults) ? "default" : "you",
        changedAt: args.identity.updatedAt === TARS_IDENTITY_UNSAVED_AT ? null : args.identity.updatedAt, editor: "tarsSettings" },
      agents: { kind: "agents", allowed, missing, source: allowedIds.length ? "you" : "none", editor: "tarsSettings" },
    },
    repositories: listed.map((repository) => {
      const rule = typeof repository.kickoffBranchNamingRule === "string" ? repository.kickoffBranchNamingRule.trim() : "";
      return { repositoryPath: repository.repositoryPath, name: repository.repositoryName,
        branchRule: { kind: "branchRule", text: rule || TARS_DEFAULT_BRANCH_NAMING_RULE, source: rule ? "you" : "default", editor: "repositorySettings" } };
    }),
    omittedRepositories: Math.max(0, args.repositories.length - listed.length),
  };
}

/**
 * A repository's memories by whether a task can receive them: `used` are
 * the reviewed ones recall draws from (always-on `core` first), `unused` the
 * candidates not reviewed yet and the stale ones recall skips. Forgotten rows
 * are in neither. The order within each group is the list's own.
 */
export function groupTarsRepositoryMemories(memories: readonly RepositoryMemory[], now: number) {
  const used: RepositoryMemory[] = [];
  const unused: RepositoryMemory[] = [];
  for (const memory of memories) {
    if (memory.deletedAt !== null) continue;
    (memory.recallMode === "candidate" || isRepositoryMemoryStale({ memory, now }) ? unused : used).push(memory);
  }
  const rank = (memory: RepositoryMemory) => memory.recallMode === "core" ? 0 : 1;
  // Array.prototype.sort is stable: equal ranks keep the list's order.
  used.sort((a, b) => rank(a) - rank(b));
  return { used, unused };
}
