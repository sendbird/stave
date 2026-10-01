// temporary-migration: playbooks-to-agent-workflows
/**
 * Playbooks retired as a separate concept: a saved playbook becomes a custom
 * agent with the Implementer's instructions and the playbook's stages as its
 * workflow. Runs once per profile, before the first read of the agents; the
 * saved playbooks stay as they are, so existing projects and their start
 * conditions keep working until they are removed.
 *
 * Idempotent: the agent id is derived from the playbook id and an agent that
 * exists already is never replaced, and the marker keeps an agent the user
 * deleted afterwards from coming back.
 */
import type { Playbook } from "@/lib/playbooks/schema";
import {
  AGENT_CONFIG_LIMITS,
  AGENT_CONFIG_VERSION,
  AGENT_EFFORT_ORDER,
  AgentConfigSchema,
  DEFAULT_AGENT_CHECK_INS,
  MAX_AGENT_CONFIGS,
  type AgentConfig,
  type AgentModel,
} from "./schema";
import { BUILTIN_AGENTS, getBuiltinAgent } from "./starters";

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

export function agentIdForPlaybook(playbookId: string): string {
  return `playbook-${playbookId}`.slice(0, AGENT_CONFIG_LIMITS.id);
}

function modelOf(playbook: Playbook): AgentModel {
  const runtime = playbook.runtime;
  if (!runtime) return { mode: "auto", taskClass: "implement" };
  const effort = AGENT_EFFORT_ORDER.find((candidate) => candidate === runtime.effort);
  return {
    mode: "fixed",
    providerId: runtime.providerId,
    ...(runtime.model ? { model: runtime.model } : {}),
    ...(effort ? { effort } : {}),
  };
}

/** The custom agent a saved playbook becomes, or null when it would not be valid. */
export function agentFromPlaybook(playbook: Playbook): AgentConfig | null {
  const implementer = getBuiltinAgent("implementer")!;
  const constraints = playbook.constraints?.trim();
  const parsed = AgentConfigSchema.safeParse({
    version: AGENT_CONFIG_VERSION,
    id: agentIdForPlaybook(playbook.id),
    source: "custom",
    name: playbook.name,
    description: clip(playbook.purpose, AGENT_CONFIG_LIMITS.description),
    instructions: clip(
      constraints ? `${implementer.instructions}\n\nConstraints:\n${constraints}` : implementer.instructions,
      AGENT_CONFIG_LIMITS.instructions,
    ),
    model: modelOf(playbook),
    tools: {},
    permission: playbook.runtime?.permissionMode ?? "auto",
    // A playbook ran on the task it was started from.
    workspace: "same-workspace",
    report: implementer.report,
    usableAs: ["primary"],
    workflow: structuredClone(playbook.stages),
    ...(playbook.checkIns === DEFAULT_AGENT_CHECK_INS ? {} : { checkIns: playbook.checkIns }),
    archived: false,
  });
  return parsed.success ? parsed.data : null;
}

export interface PlaybookAgentsMigrationState {
  playbooks: Playbook[];
  customAgents: AgentConfig[];
  playbookAgentsMigrated: boolean;
}

/** Adds an agent for each saved playbook once, then sets the marker. Mutates `settings`. */
export function migratePlaybooksToAgents(settings: PlaybookAgentsMigrationState): void {
  if (settings.playbookAgentsMigrated) return;
  const taken = new Set([...settings.customAgents, ...BUILTIN_AGENTS].map((agent) => agent.id));
  const added: AgentConfig[] = [];
  for (const playbook of settings.playbooks) {
    if (settings.customAgents.length + added.length >= MAX_AGENT_CONFIGS) break;
    if (taken.has(agentIdForPlaybook(playbook.id))) continue;
    const agent = agentFromPlaybook(playbook);
    if (!agent) continue;
    taken.add(agent.id);
    added.push(agent);
  }
  if (added.length > 0) settings.customAgents = [...settings.customAgents, ...added];
  settings.playbookAgentsMigrated = true;
}
// end temporary-migration: playbooks-to-agent-workflows
