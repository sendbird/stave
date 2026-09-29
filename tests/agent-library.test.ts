import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  duplicateAgent,
  hiddenRepositoryAgents,
  listAgents,
  normalizeCustomAgents,
  restoreCustomAgents,
  upsertCustomAgent,
} from "@/lib/agents/library";
import { AgentConfigSchema, type AgentConfig } from "@/lib/agents/schema";
import { BUILTIN_AGENTS, getBuiltinAgent } from "@/lib/agents/starters";

function custom(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    ...duplicateAgent(getBuiltinAgent("implementer")!, []),
    id: "ui-maintainer",
    name: "UI Maintainer",
    ...overrides,
  });
}

describe("agent library", () => {
  test("a repository file never hides a custom or built-in agent with the same id, and says so", () => {
    const fromRepository = (overrides: Partial<AgentConfig>) =>
      AgentConfigSchema.parse({
        ...custom(overrides),
        source: "repository",
        origin: { path: `.claude/agents/${overrides.id ?? "ui"}.md`, format: "claude-md", contentHash: "h" },
      });
    const repository = [
      fromRepository({ name: "Repo UI" }),
      fromRepository({ id: "reviewer", name: "Repo reviewer" }),
      fromRepository({ id: "release-notes", name: "Release notes" }),
    ];
    const agents = listAgents({ custom: [custom()], repository });
    expect(agents.find((agent) => agent.id === "ui-maintainer")?.name).toBe("UI Maintainer");
    expect(agents.find((agent) => agent.id === "reviewer")?.source).toBe("builtin");
    expect(agents.find((agent) => agent.id === "release-notes")?.source).toBe("repository");
    expect(agents.length).toBe(BUILTIN_AGENTS.length + 2);
    expect(hiddenRepositoryAgents({ custom: [custom()], repository }).map((entry) => entry.path)).toEqual([
      ".claude/agents/ui.md",
      ".claude/agents/reviewer.md",
    ]);
  });

  test("archived agents stay listed but not among active ones", () => {
    const archived = custom({ archived: true });
    expect(listAgents({ custom: [archived] }).some((agent) => agent.id === archived.id)).toBe(true);
    expect(listAgents({ custom: [archived], activeOnly: true }).some((agent) => agent.id === archived.id)).toBe(false);
  });

  test("duplicating makes an editable custom copy with a free id and no import or preset link", () => {
    const copy = duplicateAgent(getBuiltinAgent("scout")!, ["scout-copy"]);
    expect(copy).toMatchObject({ id: "scout-copy-2", source: "custom", name: "Scout (copy)" });
    expect(copy.workerPresetId).toBeUndefined();
    expect(copy.origin).toBeUndefined();
  });

  test("only custom agents are saved, never over a built-in id", () => {
    expect(() => upsertCustomAgent([], getBuiltinAgent("reviewer")!)).toThrow("Only custom agents");
    expect(() => upsertCustomAgent([], custom({ id: "reviewer" }))).toThrow("built-in agent id");
    const saved = upsertCustomAgent([], custom());
    expect(upsertCustomAgent(saved, custom({ name: "Renamed" })).map((agent) => agent.name)).toEqual(["Renamed"]);
  });

  test("unreadable, duplicate, built-in-id and non-custom entries are rejected, not lost", () => {
    const { agents, rejected } = normalizeCustomAgents([
      custom(),
      custom(),
      custom({ id: "implementer" }),
      { ...custom({ id: "from-newer" }), version: 2 },
      getBuiltinAgent("planner"),
    ]);
    expect(agents.map((agent) => agent.id)).toEqual(["ui-maintainer"]);
    expect(rejected).toHaveLength(4);
  });

  test("an entry kept aside earlier is read again and still kept once", () => {
    const fromNewer = { ...custom({ id: "from-newer" }), version: 2 };
    const first = restoreCustomAgents({ agents: [custom(), fromNewer], unreadable: [] });
    const second = restoreCustomAgents({ agents: first.agents, unreadable: first.unreadable });
    expect(second.agents.map((agent) => agent.id)).toEqual(["ui-maintainer"]);
    expect(second.unreadable.map((entry) => entry.value)).toEqual([fromNewer]);
  });
});

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("custom agents in settings", () => {
  test("load keeps unreadable custom agents aside and writes them back unchanged", async () => {
    const values = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    };
    (globalThis as { window?: unknown }).window = { localStorage: storage, api: {} };
    const { useAppStore } = await import("../src/store/app.store");
    const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
    const fromNewer = { ...custom({ id: "from-newer" }), version: 2 };
    const options = createAppStorePersistenceOptions();
    const state = {
      ...useAppStore.getInitialState(),
      settings: { customAgents: [custom(), fromNewer] },
    } as unknown as Parameters<NonNullable<ReturnType<typeof options.onRehydrateStorage>>>[0] & {
      settings: { customAgents: AgentConfig[]; customAgentsUnreadable: Array<{ value: unknown }> };
    };
    options.onRehydrateStorage?.(state)?.(state);
    expect(state.settings.customAgents.map((agent) => agent.id)).toEqual(["ui-maintainer"]);
    expect(state.settings.customAgentsUnreadable.map((entry) => entry.value)).toEqual([fromNewer]);
    const written = options.partialize(state as never) as {
      settings: { customAgents: unknown[]; customAgentsUnreadable: Array<{ value: unknown }> };
    };
    expect(written.settings.customAgents).toHaveLength(1);
    expect(written.settings.customAgentsUnreadable.map((entry) => entry.value)).toEqual([fromNewer]);
  });

  test("a settings patch keeps only readable custom agents", async () => {
    (globalThis as { window?: unknown }).window = { localStorage: undefined, api: {} };
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.getState().updateSettings({ patch: { customAgents: [custom(), { id: "broken" } as never] } });
    expect(useAppStore.getState().settings.customAgents.map((agent) => agent.id)).toEqual(["ui-maintainer"]);
  });
});
