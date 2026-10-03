import { afterEach, describe, expect, test } from "bun:test";
import { migratePlaybookAgentsToAutoRoute } from "../src/lib/agents/playbook-agents-auto-route-migration";
import type { AgentRevisionsMap } from "../src/lib/agents/revisions";
import { AGENT_CONFIG_VERSION, AgentConfigSchema, type AgentConfig } from "../src/lib/agents/schema";
import { getBuiltinAgent } from "../src/lib/agents/starters";

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

/** `Plan, build and verify` as the playbook editor saved it: Claude filled in to store the permission. */
const PERMISSION_ONLY_PLAYBOOK = {
  version: 1,
  id: "playbook_plan_build_verify",
  name: "Plan, build and verify",
  purpose: "Deliver the outcome in the assignment as a verified change.",
  checkIns: "plan-and-publishing",
  team: "solo",
  runtime: { providerId: "claude-code", permissionMode: "auto" },
  constraints: "Never touch the billing module.",
  stages: [
    { id: "plan", title: "Plan", kind: "ai", role: "plan", instruction: "Plan it.", doneWhen: "Criteria are written." },
    { id: "verify", title: "Verify", kind: "ai", instruction: "Check it.", doneWhen: "The checks pass." },
  ],
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-21T10:00:00.000Z",
};

const implementer = getBuiltinAgent("implementer")!;

/** The custom agent 0.23.0's playbooks migration wrote for that playbook, as saved. */
const SAVED_BY_0_23_0 = JSON.parse(
  JSON.stringify(
    AgentConfigSchema.parse({
      version: AGENT_CONFIG_VERSION,
      id: "playbook-playbook_plan_build_verify",
      source: "custom",
      name: "Plan, build and verify",
      description: "Deliver the outcome in the assignment as a verified change.",
      instructions: `${implementer.instructions}\n\nConstraints:\nNever touch the billing module.`,
      model: { mode: "fixed", providerId: "claude-code" },
      tools: {},
      permission: "auto",
      workspace: "same-workspace",
      report: implementer.report,
      usableAs: ["primary"],
      workflow: PERMISSION_ONLY_PLAYBOOK.stages,
      checkIns: "plan-and-publishing",
      archived: false,
    }),
  ),
) as AgentConfig;

const AUTO_ROUTE = { mode: "auto", taskClass: "implement" };

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
    settings: { customAgents: AgentConfig[]; playbookAgentsAutoRouted: boolean };
  };
  options.onRehydrateStorage?.()?.(state as never);
  return { state, written: options.partialize(state as never) as { settings: Record<string, unknown> } };
}

function migrate(args: { agents: AgentConfig[]; playbooks?: unknown[]; revisions?: AgentRevisionsMap }) {
  const settings = {
    playbooks: (args.playbooks ?? [PERMISSION_ONLY_PLAYBOOK]) as never,
    customAgents: args.agents,
    customAgentRevisions: args.revisions ?? {},
    playbookAgentsAutoRouted: false,
  };
  migratePlaybookAgentsToAutoRoute(settings);
  expect(settings.playbookAgentsAutoRouted).toBe(true);
  return settings.customAgents;
}

describe("temporary migration: playbook-agents-auto-route", () => {
  test("a profile that ran 0.23.0 gets the untouched playbook agent on Stave Auto, once", async () => {
    const profile = {
      playbooks: [PERMISSION_ONLY_PLAYBOOK],
      customAgents: [SAVED_BY_0_23_0],
      playbookAgentsMigrated: true,
    };
    const { state, written } = await rehydrate(JSON.parse(JSON.stringify(profile)));
    expect(state.settings.customAgents).toEqual([{ ...SAVED_BY_0_23_0, model: AUTO_ROUTE } as AgentConfig]);
    expect(written.settings.playbookAgentsAutoRouted).toBe(true);

    // Loading what was written changes nothing.
    const again = await rehydrate(JSON.parse(JSON.stringify(written.settings)));
    expect(again.state.settings.customAgents).toEqual(state.settings.customAgents);
    // Choosing the provider default afterwards is the user's choice and stays.
    const chosen = await rehydrate({
      ...JSON.parse(JSON.stringify(written.settings)),
      customAgents: [SAVED_BY_0_23_0],
    });
    expect(chosen.state.settings.customAgents[0]!.model).toEqual({ mode: "fixed", providerId: "claude-code" });
  });

  test("an agent the user edited, edited back, or duplicated stays as it is", () => {
    const renamed = { ...SAVED_BY_0_23_0, name: "Ship it" };
    expect(migrate({ agents: [renamed] })).toEqual([renamed]);
    const narrowed = { ...SAVED_BY_0_23_0, permission: "guided" as const };
    expect(migrate({ agents: [narrowed] })).toEqual([narrowed]);
    // Same content as 0.23.0 wrote, but saved in the editor since: it has history.
    const revisions: AgentRevisionsMap = {
      [SAVED_BY_0_23_0.id]: [{ savedAt: "2026-09-25T10:00:00.000Z", agent: { ...SAVED_BY_0_23_0, model: AUTO_ROUTE as never } }],
    };
    expect(migrate({ agents: [SAVED_BY_0_23_0], revisions })).toEqual([SAVED_BY_0_23_0]);
    const copy = { ...SAVED_BY_0_23_0, id: `${SAVED_BY_0_23_0.id}-copy`, name: "Plan, build and verify (copy)" };
    expect(migrate({ agents: [copy] })).toEqual([copy]);
  });

  test("an agent whose playbook chose a model, an effort or another provider, or is gone, stays as it is", () => {
    const chosen = [
      { ...PERMISSION_ONLY_PLAYBOOK, runtime: { providerId: "claude-code", model: "claude-opus-5", permissionMode: "auto" } },
      { ...PERMISSION_ONLY_PLAYBOOK, runtime: { providerId: "claude-code", effort: "high", permissionMode: "auto" } },
      { ...PERMISSION_ONLY_PLAYBOOK, runtime: { providerId: "codex", permissionMode: "auto" } },
    ];
    for (const playbook of chosen) {
      expect(migrate({ agents: [SAVED_BY_0_23_0], playbooks: [playbook] })).toEqual([SAVED_BY_0_23_0]);
    }
    expect(migrate({ agents: [SAVED_BY_0_23_0], playbooks: [] })).toEqual([SAVED_BY_0_23_0]);
  });
});
