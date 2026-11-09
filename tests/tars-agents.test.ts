import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { observeTarsContext } from "../electron/main/tars-context";
import { AgentConfigSchema, type AgentConfig, type AgentConfigInput } from "../src/lib/agents/schema";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import {
  admitTarsAgent, tarsDelegationCeiling, tarsPlannerAgents, TarsDelegateRejection, TARS_PLANNER_MAX_AGENTS,
} from "../src/lib/tars/agents";
import {
  TarsActionReceiptSchema, TarsConversationSettingsSchema, TarsDecisionActionSchema,
  type TarsConversationSettings, type TarsDecisionAction,
} from "../src/lib/tars/conversation";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { REGISTRY } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function saved(id: string, overrides: Partial<AgentConfigInput> = {}): AgentConfig {
  return AgentConfigSchema.parse({ version: 1, id, source: "custom", name: `Saved ${id}`,
    description: `Use when ${id} work is needed.`, avoidWhen: `The work is not ${id}.`, instructions: "Do the work.",
    model: { mode: "auto", taskClass: "implement" }, permission: "auto", workspace: "same-workspace",
    report: ["summary"], usableAs: ["delegate"], ...overrides });
}
const RELEASE = saved("release-notes");
const PRIVATE = saved("private-helper");
const PRIMARY_ONLY = saved("solo-lead", { usableAs: ["primary"] });
const ELSEWHERE = saved("cursor-only", { model: { mode: "fixed", providerId: "cursor" } });
const ARCHIVED = saved("retired-helper", { archived: true });
const READER = saved("careful-reader", { permission: "read-only", workspace: "same-workspace" });
const CODEX_FIXED = saved("codex-fixed", { model: { mode: "fixed", providerId: "codex", model: "gpt-6.1-sol" } });
const PUBLISHER = saved("publisher", { workflow: [
  { id: "write", title: "Write", kind: "ai", instruction: "Write the change.", doneWhen: "Written." },
  { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
] });
const AGENTS = [...BUILTIN_AGENTS, RELEASE, PRIVATE, PRIMARY_ONLY, ELSEWHERE, ARCHIVED, READER, CODEX_FIXED, PUBLISHER];
const ALLOWED = ["release-notes", "solo-lead", "cursor-only", "retired-helper", "careful-reader", "codex-fixed", "publisher"];

function reasonOf(run: () => unknown) {
  try { run(); return "admitted"; }
  catch (error) { return error instanceof TarsDelegateRejection ? error.reason : `unexpected: ${String(error)}`; }
}

describe("Tars agent admission", () => {
  const admit = (agentId: string, allowedAgentIds: readonly string[] = ALLOWED, ceiling = tarsDelegationCeiling(AGENTS),
    execution: { providerId: "codex" | "claude-code"; model: string | null } = { providerId: "codex", model: null }) =>
    reasonOf(() => admitTarsAgent({ agentId, agents: AGENTS, allowedAgentIds, executionProviderId: execution.providerId, executionModel: execution.model, ceiling }));

  test("built-in delegate agents are allowed by default; saved agents only when the user allowed them", () => {
    for (const id of ["implementer", "reviewer", "researcher", "debugger", "ui-polisher"]) expect(admit(id, [])).toBe("admitted");
    expect(admit("release-notes", [])).toBe("agentNotAllowed");
    expect(admit("private-helper")).toBe("agentNotAllowed");
    expect(admit("release-notes")).toBe("admitted");
    expect(admitTarsAgent({ agentId: "release-notes", agents: AGENTS, allowedAgentIds: ALLOWED, executionProviderId: "claude-code", executionModel: null, ceiling: "auto" }).id)
      .toBe("release-notes");
  });

  test("agents that publish outside the workspace are refused even as built-ins; publication needs a separate request", () => {
    expect(admit("shipper", [])).toBe("agentPublishes");
    expect(admit("publisher")).toBe("agentPublishes");
  });

  test("a pinned execution model refuses agents fixed to another provider or model; automatic routing admits them", () => {
    const pinnedClaude = { providerId: "claude-code" as const, model: "claude-sonnet-5-5" };
    expect(admit("codex-fixed")).toBe("admitted");
    expect(admit("codex-fixed", ALLOWED, "auto", { providerId: "claude-code", model: null })).toBe("admitted");
    expect(admit("codex-fixed", ALLOWED, "auto", pinnedClaude)).toBe("agentModelConflict");
    expect(admit("codex-fixed", ALLOWED, "auto", { providerId: "codex", model: "gpt-6.1-sol" })).toBe("admitted");
    expect(admit("codex-fixed", ALLOWED, "auto", { providerId: "codex", model: "gpt-6.1-luna" })).toBe("agentModelConflict");
    expect(admit("release-notes", ALLOWED, "auto", pinnedClaude)).toBe("admitted");
    expect(admit("reviewer", ALLOWED, "auto", pinnedClaude)).toBe("admitted");
  });

  test("unknown, archived, non-delegable and over-cap agents are refused with stable codes", () => {
    expect(admit("no-such-agent")).toBe("agentUnknown");
    expect(admit("retired-helper")).toBe("agentUnknown");
    // Primary-only built-ins, worker presets, primary-only saved agents and agents fixed to another provider.
    for (const id of ["lead", "supervisor", "scout", "solo-lead", "cursor-only"]) expect(admit(id)).toBe("agentNotDelegable");
    // The execution agent is the Auto Supervisor snapshot; a narrower one caps wider agents.
    expect(tarsDelegationCeiling(AGENTS)).toBe("auto");
    expect(tarsDelegationCeiling([])).toBe("read-only");
    expect(admit("release-notes", ALLOWED, "auto")).toBe("admitted");
    expect(admit("release-notes", ALLOWED, "guided")).toBe("agentOverCap");
    expect(admit("release-notes", ALLOWED, "manual")).toBe("agentOverCap");
    expect(admit("implementer", ALLOWED, "read-only")).toBe("agentOverCap");
    expect(admit("careful-reader", ALLOWED, "read-only")).toBe("admitted");
  });
});

describe("Tars delegate decisions with agents", () => {
  /** `null` leaves out the agent catalog port. */
  function fixture(agents: readonly AgentConfig[] | null = AGENTS) {
    const database = new Database(":memory:"); databases.push(database);
    const conversations = new TarsConversationStore(database);
    const responsibilities = new TarsStore(database);
    const registry = [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[];
    const ports: TarsDecisionPorts = { conversations, responsibilities, now: () => NOW, readRegistry: () => registry,
      requestTick: () => {}, ...(agents ? { agents: () => agents } : {}) };
    let sequence = 0;
    const message = (actions: TarsDecisionAction[], settings: Partial<TarsConversationSettings> = {}) => {
      conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 16, ...settings });
      const queued = conversations.create({ requestId: `message-${sequence++}`, text: "Ship the release notes." }, NOW);
      const claimed = conversations.claim(queued.id, queued.revision, NOW);
      return conversations.answer(claimed.id, claimed.revision, { reply: "Proposed.", actions }, NOW);
    };
    return { conversations, responsibilities, ports, message };
  }
  const unit = (title: string, agentId?: string): TarsDecisionAction => ({ kind: "delegate", workspaceId: "source-workspace", title,
    instruction: "Do the bounded work.", acceptanceCriteria: ["It is done."], priority: 50, ...(agentId ? { agentId } : {}) });

  test("each unit is admitted or refused deterministically and the admitted agent is recorded on its responsibility", async () => {
    const f = fixture();
    const message = f.message([unit("Allowed saved", "release-notes"), unit("Built-in", "researcher"), unit("Not allowed", "private-helper"),
      unit("Unknown", "made-up"), unit("Primary only", "lead"), unit("Lead chooses"), unit("Ships", "shipper")], { allowedAgentIds: ["release-notes"] });
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts.map((receipt) => [receipt.status, receipt.reason])).toEqual([
      ["applied", null], ["applied", null], ["rejected", "agentNotAllowed"], ["rejected", "agentUnknown"], ["rejected", "agentNotDelegable"], ["applied", null],
      ["rejected", "agentPublishes"],
    ]);
    expect(receipts.filter((receipt) => receipt.status === "rejected").every((receipt) => receipt.error)).toBe(true);
    const rows = f.responsibilities.snapshot().responsibilities;
    expect(rows.map((row) => [row.title, row.agentId]).sort()).toEqual([["Allowed saved", "release-notes"], ["Built-in", "researcher"], ["Lead chooses", null]]);
    // A replay returns the same outcomes and creates nothing.
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toEqual(receipts);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(3);
  });

  test("revoking an agent after the message wins, a missing agent catalog fails closed and a narrower ceiling refuses wider agents", async () => {
    const f = fixture();
    const revoked = f.message([unit("Revoked", "release-notes")], { allowedAgentIds: ["release-notes"] });
    f.conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 16 });
    expect((await applyTarsDecision({ messageId: revoked.id, expectedRevision: revoked.revision }, f.ports))[0])
      .toMatchObject({ status: "rejected", reason: "agentNotAllowed" });
    // Allowing an agent later does not widen a message that was not told about it.
    const before = f.message([unit("Later", "release-notes")]);
    f.conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 16, allowedAgentIds: ["release-notes"] });
    expect((await applyTarsDecision({ messageId: before.id, expectedRevision: before.revision }, f.ports))[0])
      .toMatchObject({ status: "rejected", reason: "agentNotAllowed" });
    // A pinned execution model refuses an agent fixed to the other provider at admission, not at run time.
    const pinned = f.message([unit("Conflict", "codex-fixed")], { allowedAgentIds: ["codex-fixed"], executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" } });
    expect((await applyTarsDecision({ messageId: pinned.id, expectedRevision: pinned.revision }, f.ports))[0])
      .toMatchObject({ status: "rejected", reason: "agentModelConflict" });
    const blind = fixture(null);
    const unknown = blind.message([unit("No catalog", "implementer")]);
    expect((await applyTarsDecision({ messageId: unknown.id, expectedRevision: unknown.revision }, blind.ports))[0])
      .toMatchObject({ status: "rejected", reason: "agentUnknown" });
    const narrow = fixture(AGENTS.map((agent) => agent.id === "supervisor" ? { ...agent, permission: "manual" as const } : agent));
    const capped = narrow.message([unit("Over cap", "implementer"), unit("Read only", "careful-reader")], { allowedAgentIds: ["careful-reader"] });
    expect((await applyTarsDecision({ messageId: capped.id, expectedRevision: capped.revision }, narrow.ports)).map((receipt) => receipt.reason))
      .toEqual(["agentOverCap", null]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
  });

  test("the agent field and allowlist are strict, and a receipt's code must match its action", () => {
    const action = unit("Strict", "release-notes");
    expect(TarsDecisionActionSchema.safeParse(action).success).toBe(true);
    for (const agentId of ["", "has space", "../escape", "x".repeat(81), 7]) expect(TarsDecisionActionSchema.safeParse({ ...action, agentId }).success).toBe(false);
    expect(TarsDecisionActionSchema.safeParse({ ...action, agent: "release-notes" }).success).toBe(false);
    expect(TarsDecisionActionSchema.safeParse({ kind: "reprioritize", responsibilityId: "goal", expectedRevision: 1, priority: 5, agentId: "implementer" }).success).toBe(false);
    const settings = { providerId: "codex", model: "chosen", maxTurns: 5 };
    expect(TarsConversationSettingsSchema.safeParse({ ...settings, allowedAgentIds: ["release-notes"], executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" } }).success).toBe(true);
    for (const invalid of [{ allowedAgentIds: ["a", "a"] }, { allowedAgentIds: ["bad id"] }, { allowedAgentIds: Array.from({ length: 51 }, (_, i) => `a${i}`) },
      { allowedAgentIds: "release-notes" }, { executionModel: { providerId: "cursor", model: "x" } }, { executionModel: { providerId: "codex", model: "" } },
      { executionModel: { providerId: "codex", model: "gpt-6.1-sol", autoRouting: false } }, { executionModel: "gpt-6.1-sol" }])
      expect(TarsConversationSettingsSchema.safeParse({ ...settings, ...invalid }).success).toBe(false);
    const receipt = { messageId: "m", actionIndex: 0, requestHash: "a".repeat(64), action, status: "rejected", responsibilityId: null,
      error: "Refused.", reason: "agentNotAllowed", revision: 2, createdAt: NOW, updatedAt: NOW };
    expect(TarsActionReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(TarsActionReceiptSchema.safeParse({ ...receipt, reason: "stale" }).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse({ ...receipt, status: "applied", responsibilityId: "r", error: null }).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse({ ...receipt, action: { kind: "control", responsibilityId: "r", expectedRevision: 1, operation: "pause" } }).success).toBe(false);
  });
});

describe("Tars planner agent context", () => {
  test("lists only admissible agents: built-ins first, then allowed saved agents, with use and avoid summaries", () => {
    const { agents, omittedAgents } = tarsPlannerAgents({ agents: AGENTS, allowedAgentIds: ["careful-reader", "release-notes", "solo-lead", "publisher", "codex-fixed"],
      executionProviderId: "codex", executionModel: null });
    const ids = agents.map((agent) => agent.id);
    expect(ids).toEqual(["implementer", "debugger", "ui-polisher", "reviewer", "researcher", "careful-reader", "release-notes", "codex-fixed"]);
    for (const excluded of ["private-helper", "solo-lead", "cursor-only", "retired-helper", "lead", "supervisor", "scout", "shipper", "publisher"]) expect(ids).not.toContain(excluded);
    // A pinned execution model hides agents that could not run on it.
    expect(tarsPlannerAgents({ agents: AGENTS, allowedAgentIds: ["codex-fixed", "release-notes"], executionProviderId: "claude-code",
      executionModel: "claude-sonnet-5-5" }).agents.map((agent) => agent.id)).not.toContain("codex-fixed");
    expect(omittedAgents).toBe(0);
    expect(agents.find((agent) => agent.id === "release-notes")).toEqual({ id: "release-notes", name: "Saved release-notes", source: "saved",
      role: "implement", access: "auto", useWhen: "Use when release-notes work is needed.", avoidWhen: "The work is not release-notes." });
    expect(agents.find((agent) => agent.id === "reviewer")).toMatchObject({ source: "built-in", role: "review", access: "read-only" });
    expect(tarsPlannerAgents({ agents: AGENTS, allowedAgentIds: [], executionProviderId: "codex", executionModel: null }).agents.every((agent) => agent.source === "built-in")).toBe(true);
  });

  test("the agent list is bounded in count and text, and the prompt names it without inventing ids", () => {
    const many = Array.from({ length: 40 }, (_, i) => saved(`helper-${i}`, { name: "N".repeat(80), description: "d".repeat(600), avoidWhen: "a".repeat(600) }));
    const allowed = many.map((agent) => agent.id);
    const bounded = tarsPlannerAgents({ agents: [...BUILTIN_AGENTS, ...many], allowedAgentIds: allowed, executionProviderId: "claude-code", executionModel: null });
    expect(bounded.agents).toHaveLength(TARS_PLANNER_MAX_AGENTS);
    expect(bounded.omittedAgents).toBe(5 + 40 - TARS_PLANNER_MAX_AGENTS);
    expect(Math.max(...bounded.agents.map((agent) => agent.useWhen.length))).toBeLessThanOrEqual(300);
    expect(Math.max(...bounded.agents.map((agent) => agent.avoidWhen?.length ?? 0))).toBeLessThanOrEqual(200);
    const database = new Database(":memory:"); databases.push(database);
    const tars = new TarsStore(database); const conversations = new TarsConversationStore(database);
    conversations.configure({ providerId: "claude-code", model: "chosen", maxTurns: 5, allowedAgentIds: allowed });
    const message = conversations.create({ requestId: "agents", text: "Write the release notes." }, NOW);
    const context = { ...observeTarsContext({ tars, loadRepositoryRegistry: () => REGISTRY, loadWorkspaceShellSummary: () => null,
      agentRuns: { getLatestAgentRunForTask: () => null } }, NOW), cwd: "/tmp/profile/representative", agents: bounded };
    const prompt = buildTarsPlannerPrompt(message, context, []);
    expect(prompt).toContain("agentId is optional");
    expect(prompt).toContain("Never invent or guess an agent id");
    const supplied = JSON.parse(prompt.split("\n\n").at(-1)!);
    expect(supplied.availableAgents).toHaveLength(TARS_PLANNER_MAX_AGENTS);
    expect(supplied.omittedAgents).toBe(bounded.omittedAgents);
    expect(supplied.availableAgents.map((agent: { id: string }) => agent.id)).not.toContain("private-helper");
  });
});
