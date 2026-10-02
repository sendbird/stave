import { afterEach, describe, expect, test } from "bun:test";
import { agentIdForPlaybook, migratePlaybooksToAgents } from "../src/lib/agents/playbook-agents-migration";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import type { AgentConfig } from "../src/lib/agents/schema";

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

/** A playbook exactly as a release with the Playbooks tab saved it. */
const SAVED_PLAYBOOK = {
  version: 1,
  id: "playbook_ship_ui",
  name: "Ship a UI fix",
  shortcut: "ship-ui",
  purpose: "Fix a UI defect and open a pull request.",
  checkIns: "plan-and-publishing",
  team: "solo",
  runtime: { providerId: "codex", model: "gpt-5.5", effort: "high", permissionMode: "guided" },
  constraints: "Never touch the billing module.",
  startsWhen: { pullRequest: { checksFailed: true, changesRequested: false } },
  stages: [
    { id: "plan", title: "Plan", kind: "ai", role: "plan", instruction: "Plan the fix.", doneWhen: "Criteria are written." },
    { id: "build", title: "Build", kind: "ai", instruction: "Fix it.", doneWhen: "It looks right.", agentConfigId: "ui-polisher" },
    { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" }, signOff: "ask" },
  ],
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-21T10:00:00.000Z",
};

async function rehydrate(settings: Record<string, unknown>) {
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    api: {},
  };
  const { useAppStore } = await import("../src/store/app.store");
  const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
  const options = createAppStorePersistenceOptions();
  const state = { ...useAppStore.getInitialState(), settings } as never as {
    settings: { customAgents: AgentConfig[]; playbooks: unknown[]; playbookAgentsMigrated: boolean };
  };
  options.onRehydrateStorage?.()?.(state as never);
  return { state, written: options.partialize(state as never) as { settings: Record<string, unknown> } };
}

describe("temporary migration: playbooks-to-agent-workflows", () => {
  test("a saved playbook from before the upgrade appears once as a custom agent with the same stages", async () => {
    const { state, written } = await rehydrate({ playbooks: [SAVED_PLAYBOOK], customAgents: [] });
    const agents = state.settings.customAgents;
    expect(agents).toHaveLength(1);
    const agent = agents[0]!;
    expect(agent).toMatchObject({
      id: "playbook-playbook_ship_ui",
      source: "custom",
      name: "Ship a UI fix",
      description: "Fix a UI defect and open a pull request.",
      model: { mode: "fixed", providerId: "codex", model: "gpt-5.5", effort: "high" },
      permission: "guided",
      workspace: "same-workspace",
      checkIns: "plan-and-publishing",
      usableAs: ["primary"],
    });
    expect(agent.instructions.startsWith(getBuiltinAgent("implementer")!.instructions)).toBe(true);
    expect(agent.instructions).toContain("Never touch the billing module.");
    expect(agent.workflow).toEqual(SAVED_PLAYBOOK.stages as never);
    // The playbook itself stays, for the projects and start conditions that still read it.
    expect(state.settings.playbooks).toHaveLength(1);
    expect(written.settings.playbookAgentsMigrated).toBe(true);

    // Loading what was written changes nothing, and a deleted agent stays deleted.
    const again = await rehydrate(JSON.parse(JSON.stringify(written.settings)));
    expect(again.state.settings.customAgents.map((candidate) => candidate.id)).toEqual(["playbook-playbook_ship_ui"]);
    const deleted = await rehydrate({ ...JSON.parse(JSON.stringify(written.settings)), customAgents: [] });
    expect(deleted.state.settings.customAgents).toEqual([]);
  });

  test("never replaces an agent with the derived id and skips a playbook that cannot be an agent", () => {
    const existing = { ...getBuiltinAgent("implementer")!, id: agentIdForPlaybook("kept"), source: "custom" as const, name: "Mine" };
    const settings = {
      playbooks: [
        { ...SAVED_PLAYBOOK, id: "kept" },
        { ...SAVED_PLAYBOOK, id: "fresh", runtime: undefined, checkIns: "when-stuck" },
      ] as never,
      customAgents: [existing],
      playbookAgentsMigrated: false,
    };
    migratePlaybooksToAgents(settings);
    expect(settings.customAgents.map((agent) => [agent.id, agent.name])).toEqual([
      ["playbook-kept", "Mine"],
      ["playbook-fresh", "Ship a UI fix"],
    ]);
    expect(settings.customAgents[1]).toMatchObject({ model: { mode: "auto", taskClass: "implement" }, permission: "auto" });
    expect(settings.customAgents[1]!.checkIns).toBeUndefined();
    expect(settings.playbookAgentsMigrated).toBe(true);
  });
});

describe("temporary migration: playbooks-to-agent-workflows, a playbook that saved only a permission", () => {
  /** `Plan, build and verify` as the playbook editor saved it: Claude filled in to store the permission. */
  const PERMISSION_ONLY = {
    ...SAVED_PLAYBOOK,
    id: "playbook_plan_build_verify",
    name: "Plan, build and verify",
    runtime: { providerId: "claude-code", permissionMode: "auto" },
    startsWhen: undefined,
  };

  test("becomes an Auto-routing agent, not a fixed provider with no model, and can be assigned", async () => {
    const settings = { playbooks: [PERMISSION_ONLY] as never, customAgents: [] as AgentConfig[], playbookAgentsMigrated: false };
    migratePlaybooksToAgents(settings);
    const agent = settings.customAgents[0]!;
    expect(agent).toMatchObject({ name: "Plan, build and verify", model: { mode: "auto", taskClass: "implement" }, permission: "auto" });
    // What the composer records for an agent that Stave Auto routes.
    const { RecordTaskAgentInputSchema } = await import("../src/lib/agents/assign");
    const record = RecordTaskAgentInputSchema.safeParse({
      requestId: "composer:1",
      taskId: "task-1",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      agent,
      assignment: "Runs as Plan, build and verify",
      providerId: "claude-code",
      model: null,
    });
    expect(record.success).toBe(true);
  });

  test("a provider other than the one the editor filled in, or an effort, is still a fixed model", () => {
    const settings = {
      playbooks: [
        { ...PERMISSION_ONLY, id: "on-codex", runtime: { providerId: "codex", permissionMode: "auto" } },
        { ...PERMISSION_ONLY, id: "with-effort", runtime: { providerId: "claude-code", effort: "high" } },
      ] as never,
      customAgents: [] as AgentConfig[],
      playbookAgentsMigrated: false,
    };
    migratePlaybooksToAgents(settings);
    expect(settings.customAgents.map((agent) => agent.model)).toEqual([
      { mode: "fixed", providerId: "codex" },
      { mode: "fixed", providerId: "claude-code", effort: "high" },
    ]);
  });
});
