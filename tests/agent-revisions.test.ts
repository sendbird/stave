import { describe, expect, test } from "bun:test";
import type { AgentAssignment } from "../src/lib/agents/assign";
import { matchesAgentActivityFilter, summarizeAgentActivity } from "../src/lib/agents/agent-activity";
import { blankCustomAgent } from "../src/lib/agents/library";
import {
  MAX_AGENT_REVISIONS,
  diffAgentVersions,
  dropAgentRevisions,
  normalizeAgentRevisions,
  pushAgentRevision,
  revisionContentHash,
  revisionRan,
} from "../src/lib/agents/revisions";

const agent = { ...blankCustomAgent({ name: "Docs", takenIds: [] }), instructions: "You write docs." };

describe("agent revisions", () => {
  test("a behavioural change pushes the replaced version, newest first", () => {
    const next = { ...agent, instructions: "You write docs and check links." };
    const map = pushAgentRevision({ revisions: {}, agentId: agent.id, previous: agent, next, savedAt: "2026-09-29T10:00:00.000Z" });
    expect(map[agent.id]).toEqual([{ savedAt: "2026-09-29T10:00:00.000Z", agent }]);
    const later = pushAgentRevision({
      revisions: map,
      agentId: agent.id,
      previous: next,
      next: { ...next, name: "Docs writer" },
      savedAt: "2026-09-29T11:00:00.000Z",
    });
    expect(later[agent.id]!.map((revision) => revision.agent.instructions)).toEqual([next.instructions, agent.instructions]);
  });

  test("archiving or a no-op save adds nothing", () => {
    const revisions = {};
    expect(
      pushAgentRevision({ revisions, agentId: agent.id, previous: agent, next: { ...agent, archived: true }, savedAt: "t" }),
    ).toBe(revisions);
    expect(pushAgentRevision({ revisions, agentId: agent.id, previous: agent, next: agent, savedAt: "t" })).toBe(revisions);
  });

  test("history is capped per agent", () => {
    let map = {};
    let previous = agent;
    for (let index = 0; index < MAX_AGENT_REVISIONS + 5; index += 1) {
      const next = { ...previous, instructions: `v${index}` };
      map = pushAgentRevision({ revisions: map, agentId: agent.id, previous, next, savedAt: `t${index}` });
      previous = next;
    }
    expect((map as Record<string, unknown[]>)[agent.id]).toHaveLength(MAX_AGENT_REVISIONS);
  });

  test("ran is decided by content hash", () => {
    expect(revisionRan({ agent, ranContentHashes: new Set([revisionContentHash(agent)]) })).toBe(true);
    expect(revisionRan({ agent: { ...agent, instructions: "x" }, ranContentHashes: new Set([revisionContentHash(agent)]) })).toBe(false);
  });

  test("diff names the fields that changed", () => {
    const labels = diffAgentVersions(agent, { ...agent, instructions: "x", name: "Other" }).map((change) => change.label);
    expect(labels).toContain("Name");
    expect(labels).toContain("Instructions");
    expect(diffAgentVersions(agent, agent)).toEqual([]);
  });

  test("drop and normalize", () => {
    const map = { [agent.id]: [{ savedAt: "t", agent }] };
    expect(dropAgentRevisions(map, agent.id)).toEqual({});
    expect(normalizeAgentRevisions(map)[agent.id]).toHaveLength(1);
    expect(normalizeAgentRevisions({ [agent.id]: [{ savedAt: "t", agent: { name: 3 } }] })).toEqual({});
    expect(normalizeAgentRevisions("nope")).toEqual({});
  });
});

function assignment(overrides: Partial<AgentAssignment>): AgentAssignment {
  return { id: "a", taskId: "t", state: "started", createdAt: "2026-09-01T00:00:00.000Z", ...overrides } as AgentAssignment;
}

describe("agent activity", () => {
  test("counts live status and failed starts", () => {
    const summary = summarizeAgentActivity({
      assignments: [
        assignment({ id: "1", taskId: "t1" }),
        assignment({ id: "2", taskId: "t2", createdAt: "2026-09-03T00:00:00.000Z" }),
        assignment({ id: "3", taskId: null as never, state: "failed" }),
        assignment({ id: "4", taskId: "cold" }),
      ],
      statusByTaskId: { t1: "running", t2: "waiting-approval" },
    });
    expect(summary).toEqual({
      total: 4,
      running: 1,
      needsYou: 1,
      couldntStart: 1,
      lastUsedAt: "2026-09-03T00:00:00.000Z",
    });
  });

  test("filters match assignment states", () => {
    expect(matchesAgentActivityFilter("preparing", "started")).toBe(true);
    expect(matchesAgentActivityFilter("failed", "started")).toBe(false);
    expect(matchesAgentActivityFilter("failed", "failed")).toBe(true);
    expect(matchesAgentActivityFilter("interrupted", "all")).toBe(true);
  });
});
