import { AgentConfigSchema, MAX_AGENT_CONFIGS, type AgentConfig, type AgentSource } from "./schema";
import { BUILTIN_AGENTS } from "./starters";

/**
 * The agent list the product shows, and the rules for the custom agents kept
 * in settings (`customAgents`).
 *
 * Built-in agents live in code and repository agents are read from files, so
 * only custom agents are saved. A saved custom agent this version cannot read
 * is kept aside as saved and read again on every load, exactly like a
 * playbook, so a newer version's data is never lost on write-back.
 */

export interface UnreadableAgent {
  value: unknown;
  issues: string[];
}

const MAX_ISSUES = 5;

function describeIssues(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.slice(0, MAX_ISSUES).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Parses saved custom agents; anything that is not a readable custom agent is rejected, not dropped silently. */
export function normalizeCustomAgents(input: unknown): { agents: AgentConfig[]; rejected: UnreadableAgent[] } {
  if (input === undefined || input === null) return { agents: [], rejected: [] };
  if (!Array.isArray(input)) return { agents: [], rejected: [{ value: input, issues: ["Saved agents are not a list."] }] };
  const agents: AgentConfig[] = [];
  const rejected: UnreadableAgent[] = [];
  const seen = new Set<string>(BUILTIN_AGENTS.map((agent) => agent.id));
  for (const candidate of input) {
    const parsed = AgentConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({ value: candidate, issues: describeIssues(parsed.error) });
      continue;
    }
    if (parsed.data.source !== "custom") {
      rejected.push({ value: candidate, issues: ["Only custom agents are saved in settings."] });
      continue;
    }
    if (seen.has(parsed.data.id)) {
      rejected.push({ value: candidate, issues: [`The id "${parsed.data.id}" is already used.`] });
      continue;
    }
    if (agents.length >= MAX_AGENT_CONFIGS) {
      rejected.push({ value: candidate, issues: [`Only ${MAX_AGENT_CONFIGS} custom agents are kept.`] });
      continue;
    }
    seen.add(parsed.data.id);
    agents.push(parsed.data);
  }
  return { agents, rejected };
}

/** Saved list first, then entries kept aside earlier; duplicates of a kept-aside value are merged. */
export function restoreCustomAgents(input: { agents: unknown; unreadable: unknown }): {
  agents: AgentConfig[];
  unreadable: UnreadableAgent[];
} {
  const saved = Array.isArray(input.agents) ? input.agents : [];
  const notAList: UnreadableAgent[] =
    input.agents === undefined || input.agents === null || Array.isArray(input.agents)
      ? []
      : [{ value: input.agents, issues: ["Saved agents are not a list."] }];
  const keptAside = Array.isArray(input.unreadable)
    ? input.unreadable.flatMap((entry) =>
        entry && typeof entry === "object" && "value" in entry ? [(entry as UnreadableAgent).value] : [],
      )
    : [];
  const result = normalizeCustomAgents([...saved, ...keptAside]);
  const seen = new Set<string>();
  const unreadable = [...notAList, ...result.rejected].filter((entry) => {
    const key = JSON.stringify(entry.value) ?? String(entry.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { agents: result.agents, unreadable };
}

const SOURCE_ORDER: Readonly<Record<AgentSource, number>> = { repository: 0, custom: 1, builtin: 2 };

/**
 * Every agent the user can pick, one per id: a repository agent overrides a
 * custom one with the same id, and both override a built-in. Archived agents
 * stay in the list (their history remains) unless `activeOnly` is set.
 */
export function listAgents(args: {
  custom: readonly AgentConfig[];
  repository?: readonly AgentConfig[];
  activeOnly?: boolean;
}): AgentConfig[] {
  const byId = new Map<string, AgentConfig>();
  const candidates = [...(args.repository ?? []), ...args.custom, ...BUILTIN_AGENTS].sort(
    (a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source],
  );
  for (const agent of candidates) {
    if (!byId.has(agent.id)) byId.set(agent.id, agent);
  }
  const agents = [...byId.values()];
  return args.activeOnly ? agents.filter((agent) => !agent.archived) : agents;
}

function uniqueId(base: string, taken: ReadonlySet<string>) {
  const stem = base.slice(0, 70);
  if (!taken.has(stem)) return stem;
  for (let index = 2; ; index += 1) {
    const candidate = `${stem}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * "Duplicate": a custom copy the user can edit. Built-in and repository agents
 * are changed only this way, so an upgrade or a pull never overwrites a copy.
 * A copy of a Worker preset mirror stops being a mirror: it has its own text.
 */
export function duplicateAgent(agent: AgentConfig, takenIds: Iterable<string>): AgentConfig {
  const taken = new Set([...takenIds, ...BUILTIN_AGENTS.map((builtin) => builtin.id)]);
  const { origin: _origin, workerPresetId: _workerPresetId, ...rest } = agent;
  return AgentConfigSchema.parse({
    ...rest,
    id: uniqueId(`${agent.id}-copy`, taken),
    source: "custom",
    name: `${agent.name} (copy)`.slice(0, 80),
    archived: false,
  });
}

/** Replaces a custom agent in place; refuses anything that is not one. */
export function upsertCustomAgent(list: readonly AgentConfig[], agent: AgentConfig): AgentConfig[] {
  const parsed = AgentConfigSchema.parse(agent);
  if (parsed.source !== "custom") throw new Error("Only custom agents can be saved.");
  if (BUILTIN_AGENTS.some((builtin) => builtin.id === parsed.id)) throw new Error(`"${parsed.id}" is a built-in agent id.`);
  const index = list.findIndex((candidate) => candidate.id === parsed.id);
  if (index < 0) {
    if (list.length >= MAX_AGENT_CONFIGS) throw new Error(`You have ${MAX_AGENT_CONFIGS} custom agents, the most Stave keeps.`);
    return [...list, parsed];
  }
  return list.map((candidate, position) => (position === index ? parsed : candidate));
}
