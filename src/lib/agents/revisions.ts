import { AgentConfigSchema, type AgentConfig } from "./schema";
import { hashAgentContent } from "./compile";

/**
 * Version history for custom agents. Each save of an existing custom agent
 * whose behavioural content changed pushes the *replaced* version onto that
 * agent's list, newest first, capped at {@link MAX_AGENT_REVISIONS}. A restore
 * saves an old version as the current agent, which itself pushes the version
 * it replaced — so history is never rewritten, only appended to.
 *
 * Kept apart from the agents themselves (a separate settings key,
 * `customAgentRevisions`) so an agent's own bytes stay exactly what a provider
 * receives, and deleting an agent drops its history with it.
 *
 * Pure and deterministic: the same content hash never appears twice in a row,
 * so re-saving with no behavioural change adds nothing.
 */

export const MAX_AGENT_REVISIONS = 10;

export interface AgentRevision {
  /** ISO time the replaced version was pushed (i.e. when the new save landed). */
  savedAt: string;
  /** The agent exactly as it was before this save. */
  agent: AgentConfig;
}

/** Keyed by agent id; newest revision first. */
export type AgentRevisionsMap = Record<string, AgentRevision[]>;

/**
 * The content hash used to decide "did this change" and to join a revision to
 * the assignment rows that ran it. Mirrors `snapshotAgent`: `archived` and
 * `concurrency` do not change behaviour, so a pure archive/unarchive or a
 * concurrency tweak is not a new version.
 */
export function revisionContentHash(agent: AgentConfig): string {
  const { archived: _archived, concurrency: _concurrency, ...content } = agent;
  return hashAgentContent(content);
}

/**
 * Pushes `previous` (the version being replaced) onto `agentId`'s history when
 * its content differs from `next` (the version just saved). Returns the map
 * unchanged when nothing behavioural changed, so a no-op save keeps history
 * flat. Caps at {@link MAX_AGENT_REVISIONS}, dropping the oldest.
 */
export function pushAgentRevision(args: {
  revisions: AgentRevisionsMap;
  agentId: string;
  previous: AgentConfig;
  next: AgentConfig;
  savedAt: string;
}): AgentRevisionsMap {
  if (revisionContentHash(args.previous) === revisionContentHash(args.next)) {
    return args.revisions;
  }
  const existing = args.revisions[args.agentId] ?? [];
  const entry: AgentRevision = { savedAt: args.savedAt, agent: structuredClone(args.previous) };
  const list = [entry, ...existing].slice(0, MAX_AGENT_REVISIONS);
  return { ...args.revisions, [args.agentId]: list };
}

/** Drops one agent's history, e.g. when the agent is deleted. */
export function dropAgentRevisions(revisions: AgentRevisionsMap, agentId: string): AgentRevisionsMap {
  if (!(agentId in revisions)) return revisions;
  const { [agentId]: _dropped, ...rest } = revisions;
  return rest;
}

/**
 * Parses a saved `customAgentRevisions` map: anything that is not a readable
 * revision of a custom agent is left out (not thrown), so one bad entry cannot
 * strand the rest. Caps each list defensively.
 */
export function normalizeAgentRevisions(input: unknown): AgentRevisionsMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: AgentRevisionsMap = {};
  for (const [agentId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const list: AgentRevision[] = [];
    for (const candidate of value) {
      if (!candidate || typeof candidate !== "object") continue;
      const savedAt = (candidate as { savedAt?: unknown }).savedAt;
      const parsed = AgentConfigSchema.safeParse((candidate as { agent?: unknown }).agent);
      if (typeof savedAt !== "string" || !parsed.success || parsed.data.source !== "custom") continue;
      if (parsed.data.id !== agentId) continue;
      list.push({ savedAt, agent: parsed.data });
      if (list.length >= MAX_AGENT_REVISIONS) break;
    }
    if (list.length > 0) out[agentId] = list;
  }
  return out;
}

/**
 * Whether any recorded assignment ran this exact version. The assignment rows
 * carry the `snapshotAgent` content hash, so we compare against that same hash
 * of the revision's agent.
 */
export function revisionRan(args: { agent: AgentConfig; ranContentHashes: ReadonlySet<string> }): boolean {
  return args.ranContentHashes.has(revisionContentHash(args.agent));
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "Use when",
  avoidWhen: "Don't use when",
  instructions: "Instructions",
  skills: "Skills",
  model: "Model",
  tools: "Tools & limits",
  permission: "Permission",
  workspace: "Works in",
  usableAs: "Usable as",
  report: "Report",
  appearance: "Colour",
  concurrency: "Concurrency",
  archived: "Archived",
};

const DIFF_FIELDS = Object.keys(FIELD_LABELS) as Array<keyof AgentConfig>;

export interface AgentFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

function renderFieldValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((entry) => String(entry)).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The fields that differ between two agent versions, in a stable order, for a
 * side-by-side diff. Pure: the words shown are decided here, not in the view.
 */
export function diffAgentVersions(from: AgentConfig, to: AgentConfig): AgentFieldChange[] {
  const changes: AgentFieldChange[] = [];
  for (const field of DIFF_FIELDS) {
    const before = renderFieldValue(from[field]);
    const after = renderFieldValue(to[field]);
    if (before !== after) {
      changes.push({ field: String(field), label: FIELD_LABELS[field] ?? String(field), from: before, to: after });
    }
  }
  return changes;
}
