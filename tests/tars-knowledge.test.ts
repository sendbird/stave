import { describe, expect, test } from "bun:test";
import { REPOSITORY_MEMORY_STALE_AFTER_MS, type RepositoryMemory } from "../src/lib/repository-memory";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "../src/lib/tars/branch-name";
import { TARS_IDENTITY_UNSAVED_AT } from "../src/lib/tars/default-instructions";
import {
  TARS_PLANNER_HISTORY_MESSAGES, TARS_PLANNER_MAX_REPOSITORIES, buildTarsKnowledge, groupTarsRepositoryMemories,
} from "../src/lib/tars/knowledge";
import { buildTarsPlannerPrompt, type TarsPlannerContext } from "../electron/main/tars-planner";
import type { TarsMessage } from "../src/lib/tars/conversation";

const SAVED_AT = "2026-11-05T00:00:00.000Z";
const DEFAULTS = ["Default instructions.", "기본 지침."];
const NOW = Date.parse("2026-11-10T12:00:00.000Z");

function build(patch: Partial<Parameters<typeof buildTarsKnowledge>[0]> = {}) {
  return buildTarsKnowledge({ identity: { instructions: "Open pull requests as drafts.", updatedAt: SAVED_AT }, defaults: DEFAULTS, settings: null,
    agentNameOf: (id) => id === "release-notes" ? "Release notes" : null, repositories: [], ...patch });
}

function memory(patch: Partial<RepositoryMemory> & Pick<RepositoryMemory, "id">): RepositoryMemory {
  return { repositoryPath: "/tmp/repo", kind: "fact", recallMode: "contextual", content: `Memory ${patch.id}`, sourceTaskId: null, sourceTurnId: null,
    confidence: 0.9, createdAt: NOW - 86_400_000, lastConfirmedAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, deletedAt: null, ...patch };
}

describe("what Tars knows", () => {
  test("standing instructions say whose they are and when they were saved", () => {
    expect(build().everywhere.instructions).toEqual({ kind: "instructions", text: "Open pull requests as drafts.", source: "you", changedAt: SAVED_AT, editor: "tarsSettings" });
    // The offered default in either language is Stave's, with or without surrounding whitespace.
    expect(build({ identity: { instructions: "  기본 지침.\n", updatedAt: SAVED_AT } }).everywhere.instructions).toMatchObject({ source: "default", text: "기본 지침." });
    // Never saved and empty: nothing set, and no time to show.
    expect(build({ identity: { instructions: "   ", updatedAt: TARS_IDENTITY_UNSAVED_AT } }).everywhere.instructions).toMatchObject({ source: "none", text: "", changedAt: null });
  });

  test("allowed agents are named, and an allowed agent that no longer exists is counted apart", () => {
    expect(build().everywhere.agents).toEqual({ kind: "agents", allowed: [], missing: [], source: "none", editor: "tarsSettings" });
    expect(build({ settings: { allowedAgentIds: ["release-notes", "gone"] } }).everywhere.agents)
      .toEqual({ kind: "agents", allowed: [{ id: "release-notes", name: "Release notes" }], missing: ["gone"], source: "you", editor: "tarsSettings" });
  });

  test("each repository carries its own branch rule, the default when none is set", () => {
    const { repositories, omittedRepositories } = build({ repositories: [
      { repositoryPath: "/tmp/a", repositoryName: "a", kickoffBranchNamingRule: "  feat/<ticket>  " },
      { repositoryPath: "/tmp/b", repositoryName: "b", kickoffBranchNamingRule: "   " },
      { repositoryPath: "/tmp/c", repositoryName: "c" },
    ] });
    expect(omittedRepositories).toBe(0);
    expect(repositories.map((repository) => [repository.name, repository.branchRule.source, repository.branchRule.text])).toEqual([
      ["a", "you", "feat/<ticket>"], ["b", "default", TARS_DEFAULT_BRANCH_NAMING_RULE], ["c", "default", TARS_DEFAULT_BRANCH_NAMING_RULE],
    ]);
    expect(repositories.every((repository) => repository.branchRule.editor === "repositorySettings")).toBe(true);
  });

  test("repositories beyond the planner's inventory are counted, not listed", () => {
    const many = Array.from({ length: TARS_PLANNER_MAX_REPOSITORIES + 3 }, (_, index) => ({ repositoryPath: `/tmp/r${index}`, repositoryName: `r${index}` }));
    const knowledge = build({ repositories: many });
    expect(knowledge.repositories).toHaveLength(TARS_PLANNER_MAX_REPOSITORIES);
    expect(knowledge.repositories.at(-1)!.name).toBe(`r${TARS_PLANNER_MAX_REPOSITORIES - 1}`);
    expect(knowledge.omittedRepositories).toBe(3);
    expect(build().repositories).toEqual([]);
  });

  test("memories split by whether a task can receive them: core first, candidates and stale ones apart, forgotten ones nowhere", () => {
    const stale = memory({ id: "stale", confidence: 0.6, lastConfirmedAt: NOW - REPOSITORY_MEMORY_STALE_AFTER_MS - 1 });
    // Old but confident: recall still uses it.
    const oldConfident = memory({ id: "old-confident", confidence: 0.9, lastConfirmedAt: NOW - REPOSITORY_MEMORY_STALE_AFTER_MS - 1 });
    const groups = groupTarsRepositoryMemories([
      memory({ id: "contextual-1" }), memory({ id: "candidate", recallMode: "candidate" }), memory({ id: "core", recallMode: "core" }),
      stale, oldConfident, memory({ id: "forgotten", deletedAt: NOW - 1 }), memory({ id: "contextual-2" }),
    ], NOW);
    expect(groups.used.map((item) => item.id)).toEqual(["core", "contextual-1", "old-confident", "contextual-2"]);
    expect(groups.unused.map((item) => item.id)).toEqual(["candidate", "stale"]);
    expect(groupTarsRepositoryMemories([], NOW)).toEqual({ used: [], unused: [] });
  });
});

describe("what the planner rereads", () => {
  const message = (id: string, text: string): TarsMessage => ({ id, requestId: `request-${id}`, text, providerId: "codex", model: "model", maxTurns: 30,
    state: "answered", revision: 2, reply: `Reply to ${text}`, error: null, decision: { reply: `Reply to ${text}`, actions: [] }, createdAt: SAVED_AT, updatedAt: SAVED_AT });
  const context: TarsPlannerContext = {
    snapshot: { runtime: "desktop", identity: { id: "personal", name: "Tars", instructions: "Open pull requests as drafts.", updatedAt: SAVED_AT }, responsibilities: [] },
    cwd: "/tmp/reasoning", agents: { agents: [], omittedAgents: 0 },
    observation: { source: "local-persisted-snapshot", observedAt: SAVED_AT, repositories: [], responsibilities: [], requests: [], omittedRequests: 0,
      omittedRepositories: 0, omittedWorkspaces: 0, omittedResponsibilities: 0 },
  };

  test("the prompt carries the standing instructions and only the last messages the view says it rereads", () => {
    const history = Array.from({ length: TARS_PLANNER_HISTORY_MESSAGES + 4 }, (_, index) => message(`m${index}`, `earlier message ${index}`));
    const prompt = buildTarsPlannerPrompt(message("current", "What is next?"), context, history);
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n{") + 2)) as { preferences: string; history: Array<{ textExcerpt: string }> };
    expect(data.preferences).toBe("Open pull requests as drafts.");
    expect(data.history).toHaveLength(TARS_PLANNER_HISTORY_MESSAGES);
    expect(data.history[0]!.textExcerpt).toBe("earlier message 4");
    expect(data.history.at(-1)!.textExcerpt).toBe(`earlier message ${TARS_PLANNER_HISTORY_MESSAGES + 3}`);
    // Repository memory is not part of what the planner reads.
    expect(prompt).not.toContain("project-memory");
  });
});
