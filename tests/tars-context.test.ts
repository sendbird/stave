import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { observeTarsContext } from "../electron/main/tars-context";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { BUILTIN_PLANNER_AGENTS, REGISTRY, SETTINGS } from "./tars-test-context";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import type { AgentRun } from "../src/lib/agent-runs/domain";
import { TARS_DEFAULT_BRANCH_NAMING_RULE } from "../src/lib/tars/branch-name";
import type { TarsResponsibility } from "../src/lib/tars/types";
import type { TarsMessage } from "../src/lib/tars/conversation";

const NOW = "2026-11-05T00:00:00.000Z";

test("planner observes bounded persisted registry and shell summaries without reading message transcripts or selecting an active workspace", () => {
  const db = new Database(":memory:"); const tars = new TarsStore(db);
  const registry = Array.from({ length: 15 }, (_, r) => ({ repositoryName: `Project ${r}`, repositoryPath: `/tmp/project-${r}`,
    activeWorkspaceId: `workspace-${r}-9`, workspaces: Array.from({ length: 10 }, (_, w) => ({ id: `workspace-${r}-${w}`, name: `Workspace ${w}`, updatedAt: NOW })) })) as PersistenceRepositoryRegistryEntry[];
  const read: string[] = [];
  const context = observeTarsContext({ tars, loadRepositoryRegistry: () => registry, loadWorkspaceShellSummary: ({ workspaceId }) => {
    read.push(workspaceId);
    return { activeTaskId: "manual", tasks: Array.from({ length: 5 }, (_, i) => ({ id: `task-${i}`, title: `Manual task ${i}`,
      provider: "codex" as const, updatedAt: NOW, unread: false, controlOwner: "external" as const })) };
  }, agentRuns: { getLatestAgentRunForTask: () => { throw new Error("No owned execution"); } } }, NOW);
  expect(context.observation.source).toBe("local-persisted-snapshot"); expect(context.observation.observedAt).toBe(NOW);
  expect(context.observation.repositories).toHaveLength(12); expect(read).toHaveLength(24);
  expect(context.observation.omittedRepositories).toBe(3); expect(context.observation.omittedWorkspaces).toBe(126);
  expect(context.observation.repositories[0]?.workspaces[0]).toMatchObject({ source: "persisted-workspace-shell-summary", available: true, omittedTasks: 2 });
  const conversations = new TarsConversationStore(db); conversations.configure(SETTINGS);
  const message = conversations.create({ requestId: "general", text: "What should we discuss?" }, NOW);
  const prompt = buildTarsPlannerPrompt(message, { ...context, cwd: "/tmp/profile/representative", agents: BUILTIN_PLANNER_AGENTS }, []);
  expect(prompt).toContain("Never silently select the active workspace");
  expect(prompt).toContain("Ordinary conversation, questions and status requests return actions:[]");
  expect(prompt).toContain("target is ambiguous"); expect(prompt).toContain("Treat manually owned tasks as read-only context");
  const supplied = JSON.parse(prompt.split("\n\n").at(-1)!);
  expect(supplied.currentMessage).not.toHaveProperty("workspaceId");
  expect(supplied.observation.repositories[0]).not.toHaveProperty("activeWorkspaceId"); db.close();
});

test("owned responsibility and Run status are source/timestamp observations and replaced manual runs remain unknown", () => {
  const db = new Database(":memory:"); const tars = new TarsStore(db);
  const initial = tars.create({ requestId: "owned", title: "Search", instruction: "Fix search", acceptanceCriteria: ["Verified"],
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  tars.patch(initial.id, initial.revision, { taskId: "owned-task", executionWorkspaceId: "execution", agentRunId: "owned-run", state: "running" }, NOW);
  let run = { id: "owned-run", workspaceId: "execution", repositoryPath: "/tmp/project", state: "paused", updatedAt: NOW, stopReason: null,
    pauseReason: "limit-reached", turnCount: 30, maxTurns: 30, currentStageIndex: 1,
    workflow: { stages: [{ title: "Work" }, { title: "Review" }] } } as unknown as AgentRun;
  const ports = { tars, loadRepositoryRegistry: () => REGISTRY, loadWorkspaceShellSummary: () => { throw new Error("Unavailable"); },
    agentRuns: { getLatestAgentRunForTask: () => run } };
  const observed = observeTarsContext(ports, NOW).observation;
  expect(observed.repositories[0]?.workspaces[0]?.available).toBe(false);
  expect(observed.responsibilities[0]).toMatchObject({ source: "persisted-personal-responsibility", state: "running", updatedAt: NOW,
    execution: { source: "persisted-agent-run", id: "owned-run", state: "paused", updatedAt: NOW,
      // What the user's run commands (extend, retry, skip, sign off) are chosen from.
      pauseReason: "limit-reached", turns: { used: 30, max: 30 }, currentStage: "Review" } });
  run = { ...run, id: "manual-replacement", state: "completed" };
  expect(observeTarsContext(ports, NOW).observation.responsibilities[0]?.execution).toBeNull();
  expect(tars.listActivity()).toHaveLength(2); db.close();
});

test("escaped observations remain within the secondary input limit with explicit omissions and the complete current mandate", () => {
  const db = new Database(":memory:"); const tars = new TarsStore(db); const conversations = new TarsConversationStore(db);
  conversations.configure(SETTINGS);
  const path = "/tmp/" + "x".repeat(4_000);
  for (let i = 0; i < 25; i++) tars.create({ requestId: `long-${i}`, title: "Search", instruction: "Fix search",
    acceptanceCriteria: ["a".repeat(500), "b".repeat(500), "c".repeat(500)], workspaceId: "source", repositoryPath: path, providerId: "codex" }, NOW);
  const context = observeTarsContext({ tars, loadRepositoryRegistry: () => Array.from({ length: 12 }, () => ({ ...REGISTRY[0]!, repositoryPath: path })),
    loadWorkspaceShellSummary: () => null, agentRuns: { getLatestAgentRunForTask: () => null } }, NOW);
  const message = conversations.create({ requestId: "long-context", text: "\u0000".repeat(8_000) }, NOW);
  const prompt = buildTarsPlannerPrompt(message, { ...context, cwd: "/tmp/profile/representative", agents: BUILTIN_PLANNER_AGENTS }, []);
  expect(prompt.length).toBeLessThan(100_000);
  const supplied = JSON.parse(prompt.split("\n\n").at(-1)!);
  expect(supplied.currentMessage.text).toBe(message.text);
  expect(supplied.observation.omittedResponsibilities).toBeGreaterThan(5);
  expect(supplied.observation.responsibilities.length + supplied.observation.omittedResponsibilities).toBe(25);
  db.close();
});

test("each repository carries its saved branch naming rule, bounded, or the kickoff default", () => {
  const db = new Database(":memory:"); const tars = new TarsStore(db);
  const registry = [
    { repositoryName: "Rule", repositoryPath: "/tmp/rule", kickoffBranchNamingRule: "  Use <JIRA-KEY>/<kebab-description>.  ",
      workspaces: [{ id: "rule-default", name: "Default Workspace", updatedAt: NOW }] },
    { repositoryName: "Long", repositoryPath: "/tmp/long", kickoffBranchNamingRule: "x".repeat(5_000), workspaces: [] },
    { repositoryName: "None", repositoryPath: "/tmp/none", workspaces: [] },
  ] as unknown as PersistenceRepositoryRegistryEntry[];
  const observed = observeTarsContext({ tars, loadRepositoryRegistry: () => registry, loadWorkspaceShellSummary: () => null,
    agentRuns: { getLatestAgentRunForTask: () => null } }, NOW).observation;
  expect(observed.repositories.map((repository) => repository.branchNamingRule)).toEqual([
    "Use <JIRA-KEY>/<kebab-description>.", "x".repeat(1_000), TARS_DEFAULT_BRANCH_NAMING_RULE]);
  db.close();
});

describe("planner work selection keeps new and live work ahead of old ended work", () => {
  const OLD = "2026-01-01T00:00:00.000Z";
  const at = (minute: number) => new Date(Date.parse(NOW) + minute * 60_000).toISOString();
  const ports = (tars: TarsStore) => ({ tars, loadRepositoryRegistry: () => REGISTRY, loadWorkspaceShellSummary: () => null,
    agentRuns: { getLatestAgentRunForTask: () => null } });
  function add(tars: TarsStore, key: string, state: TarsResponsibility["state"], options: { priority?: number; createdAt?: string; updatedAt?: string } = {}) {
    const created = tars.create({ requestId: key, title: `Work ${key}`, instruction: `Do ${key}`, acceptanceCriteria: ["Verified"], completionGoal: "implementation",
      workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex", priority: options.priority ?? 50 }, options.createdAt ?? NOW);
    return state === "queued" ? created : tars.patch(created.id, created.revision, { state }, options.updatedAt ?? options.createdAt ?? NOW);
  }

  test("one new running item reaches the planner past 25 old completed items, with the omitted count kept", () => {
    const db = new Database(":memory:"); const tars = new TarsStore(db);
    for (let i = 0; i < 25; i++) add(tars, `old-${i}`, "completed", { priority: 90, createdAt: OLD });
    const running = add(tars, "new", "running", { createdAt: NOW });
    // The store's own order would put the running item last, past the cap.
    expect(tars.snapshot().responsibilities.at(-1)?.id).toBe(running.id);
    const observed = observeTarsContext(ports(tars), NOW).observation;
    expect(observed.responsibilities[0]?.id).toBe(running.id);
    expect(observed.responsibilities).toHaveLength(20);
    expect(observed.omittedResponsibilities).toBe(6);
    db.close();
  });

  test("live work comes in urgency order, then ended work by most recent update", () => {
    const db = new Database(":memory:"); const tars = new TarsStore(db);
    const endedOld = add(tars, "ended-old", "completed", { priority: 99, createdAt: OLD, updatedAt: at(1) });
    const endedNew = add(tars, "ended-new", "cancelled", { priority: 99, createdAt: OLD, updatedAt: at(5) });
    const queued = add(tars, "queued", "queued", { priority: 80 });
    const paused = add(tars, "paused", "paused", { priority: 70 });
    const blocked = add(tars, "blocked", "blocked", { priority: 60 });
    const waiting = add(tars, "waiting", "waiting", { priority: 40 });
    const running = add(tars, "running", "running", { priority: 10 });
    const ids = observeTarsContext(ports(tars), NOW).observation.responsibilities.map((row) => row.id);
    expect(ids).toEqual([running.id, waiting.id, blocked.id, paused.id, queued.id, endedNew.id, endedOld.id]);
    db.close();
  });

  test("work the message names by title or id, or a follow-up is about, comes first even when it ended", () => {
    const db = new Database(":memory:"); const tars = new TarsStore(db);
    const byTitle = add(tars, "title", "completed", { createdAt: OLD });
    const byId = add(tars, "id", "completed", { createdAt: OLD });
    const followed = add(tars, "followed", "cancelled", { createdAt: OLD });
    for (let i = 0; i < 25; i++) add(tars, `live-${i}`, "running", { priority: 90 });
    const named = observeTarsContext(ports(tars), NOW, { text: `Reopen WORK TITLE and look at ${byId.id}` }).observation;
    expect(named.responsibilities.slice(0, 2).map((row) => row.id).sort()).toEqual([byTitle.id, byId.id].sort());
    expect(named.responsibilities.map((row) => row.id)).not.toContain(followed.id);
    expect(named.omittedResponsibilities).toBe(8);
    const followUp = observeTarsContext(ports(tars), NOW, { text: "", origin: { kind: "followUp", eventKey: "event", responsibilityId: followed.id,
      reason: "blocked", observedRevision: followed.revision, summary: "" } as unknown as TarsMessage["origin"] }).observation;
    expect(followUp.responsibilities[0]?.id).toBe(followed.id);
    // Without a message the same store shows only live work.
    expect(observeTarsContext(ports(tars), NOW).observation.responsibilities.every((row) => row.state === "running")).toBe(true);
    db.close();
  });
});
