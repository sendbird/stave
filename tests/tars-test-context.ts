import { observeTarsContext } from "../electron/main/tars-context";
import type { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import { tarsPlannerAgents } from "../src/lib/tars/agents";

export const SETTINGS = { providerId: "codex" as const, model: "test-model", maxTurns: 6 };
export const REGISTRY = [{ repositoryPath: "/tmp/project", repositoryName: "Project", workspaces: [{ id: "source", name: "Source", updatedAt: "2026-11-05T00:00:00.000Z" }] }] as PersistenceRepositoryRegistryEntry[];
/** The built-in agents only, as on a fresh install. */
export const BUILTIN_PLANNER_AGENTS = tarsPlannerAgents({ agents: BUILTIN_AGENTS, allowedAgentIds: [], executionProviderId: "codex", executionModel: null });
export function testContext(tars: TarsStore, registry = REGISTRY) {
  return { ...observeTarsContext({ tars, loadRepositoryRegistry: () => registry,
    loadWorkspaceShellSummary: () => null, agentRuns: { getLatestAgentRunForTask: () => null } }, "2026-11-05T00:00:00.000Z"),
    cwd: "/tmp/profile/representative", agents: BUILTIN_PLANNER_AGENTS };
}
