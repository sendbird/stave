// temporary-migration: playbook-agents-auto-route
/**
 * 0.23.0 copied a playbook that saved only a permission (`{ providerId:
 * "claude-code", permissionMode }`: the playbook editor filled Claude in, the
 * user did not choose it) into a custom agent fixed to Claude with no model.
 * Later releases make such a playbook an agent Stave Auto routes, but the
 * playbooks migration runs once, so a profile that ran 0.23.0 keeps the old
 * agent. This moves that agent to Stave Auto once per profile.
 *
 * Only an agent that is still exactly what 0.23.0 wrote is changed: its
 * content hash must equal the agent 0.23.0 derived from its saved playbook,
 * and it must have no version history (every save in the editor that changes
 * behaviour leaves one). Anything the user edited, duplicated or created stays
 * as it is.
 *
 * Self-contained on purpose: it outlives the playbooks migration
 * (`playbook-agents-migration.ts`), so it repeats how 0.23.0 built the agent.
 */
import type { Playbook } from "@/lib/playbooks/schema";
import type { AgentRevisionsMap } from "./revisions";
import { revisionContentHash } from "./revisions";
import {
  AGENT_CONFIG_LIMITS,
  AGENT_CONFIG_VERSION,
  AGENT_EFFORT_ORDER,
  AgentConfigSchema,
  DEFAULT_AGENT_CHECK_INS,
  type AgentConfig,
  type AgentModel,
} from "./schema";
import { getBuiltinAgent } from "./starters";

/** The model 0.23.0 saved for a playbook that stored only a permission. */
const MODEL_SAVED_BY_0_23_0: AgentModel = { mode: "fixed", providerId: "claude-code" };
/** What a playbook without a chosen model becomes now. */
const AUTO_ROUTE: AgentModel = { mode: "auto", taskClass: "implement" };

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** The runtime the playbook editor wrote to store only a permission. */
function savedOnlyAPermission(playbook: Playbook): boolean {
  const runtime = playbook.runtime;
  if (!runtime || runtime.providerId !== "claude-code" || runtime.model) return false;
  return !AGENT_EFFORT_ORDER.some((effort) => effort === runtime.effort);
}

/** The custom agent 0.23.0 wrote for a permission-only playbook. */
function agentAs0230SavedIt(playbook: Playbook): AgentConfig | null {
  const implementer = getBuiltinAgent("implementer");
  if (!implementer) return null;
  const constraints = playbook.constraints?.trim();
  const parsed = AgentConfigSchema.safeParse({
    version: AGENT_CONFIG_VERSION,
    id: `playbook-${playbook.id}`.slice(0, AGENT_CONFIG_LIMITS.id),
    source: "custom",
    name: playbook.name,
    description: clip(playbook.purpose, AGENT_CONFIG_LIMITS.description),
    instructions: clip(
      constraints ? `${implementer.instructions}\n\nConstraints:\n${constraints}` : implementer.instructions,
      AGENT_CONFIG_LIMITS.instructions,
    ),
    model: MODEL_SAVED_BY_0_23_0,
    tools: {},
    permission: playbook.runtime?.permissionMode ?? "auto",
    workspace: "same-workspace",
    report: implementer.report,
    usableAs: ["primary"],
    workflow: structuredClone(playbook.stages),
    ...(playbook.checkIns === DEFAULT_AGENT_CHECK_INS ? {} : { checkIns: playbook.checkIns }),
    archived: false,
  });
  return parsed.success ? parsed.data : null;
}

export interface PlaybookAgentsAutoRouteState {
  playbooks: Playbook[];
  customAgents: AgentConfig[];
  customAgentRevisions: AgentRevisionsMap;
  playbookAgentsAutoRouted: boolean;
}

/** Moves each untouched 0.23.0 permission-only playbook agent to Stave Auto once, then sets the marker. Mutates `settings`. */
export function migratePlaybookAgentsToAutoRoute(settings: PlaybookAgentsAutoRouteState): void {
  if (settings.playbookAgentsAutoRouted) return;
  const untouchedHashById = new Map<string, string>();
  for (const playbook of settings.playbooks) {
    if (!savedOnlyAPermission(playbook)) continue;
    const saved = agentAs0230SavedIt(playbook);
    if (saved) untouchedHashById.set(saved.id, revisionContentHash(saved));
  }
  if (untouchedHashById.size > 0) {
    let changed = false;
    const agents = settings.customAgents.map((agent) => {
      const hash = untouchedHashById.get(agent.id);
      if (!hash || agent.source !== "custom") return agent;
      if ((settings.customAgentRevisions[agent.id]?.length ?? 0) > 0) return agent;
      if (revisionContentHash(agent) !== hash) return agent;
      changed = true;
      return { ...agent, model: { ...AUTO_ROUTE } };
    });
    if (changed) settings.customAgents = agents;
  }
  settings.playbookAgentsAutoRouted = true;
}
// end temporary-migration: playbook-agents-auto-route
