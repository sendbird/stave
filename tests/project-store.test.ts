import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ProjectStore } from "../electron/persistence/project-store";
import { DEFAULT_PROJECT_SETTINGS, type MissionProposal, type Project } from "../src/lib/projects/domain";
import { starterPlaybook } from "./fixtures/mission-fixtures";

const NOW = "2026-09-26T10:00:00.000Z";

function project(id = "project-1", taskId = "coord-1"): Project {
  return {
    id,
    name: "Design system move",
    goal: "Every dashboard screen uses the new components.",
    repositoryPath: "/tmp/repo",
    coordinator: { workspaceId: "ws-1", taskId },
    settings: DEFAULT_PROJECT_SETTINGS,
    state: "active",
    summary: null,
    reasonDetail: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function proposal(id: string, startKey: string): MissionProposal {
  return {
    id,
    projectId: "project-1",
    startKey,
    playbook: starterPlaybook("request-to-pr"),
    assignment: "Move the billing table.",
    providerId: "codex",
    model: null,
    worktreeName: "billing",
    state: "pending",
    workspaceId: null,
    taskId: null,
    missionId: null,
    detail: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("project store", () => {
  test("a task coordinates at most one open project", () => {
    const store = new ProjectStore(new Database(":memory:"));
    expect(store.create(project(), { kind: "project-created", detail: {} })).toEqual({ ok: true });
    expect(store.create(project("project-2"))).toMatchObject({ ok: false });
    store.update({ ...project(), state: "completed" });
    expect(store.create(project("project-2"))).toEqual({ ok: true });
    expect(store.listProjects({ openOnly: true }).map((entry) => entry.id)).toEqual(["project-2"]);
    expect(store.getOpenProjectForCoordinator("coord-1")?.id).toBe("project-2");
  });

  test("a repeated start key returns the proposal it already made", () => {
    const store = new ProjectStore(new Database(":memory:"));
    store.create(project());
    expect(store.upsertProposal(proposal("p1", "billing")).created).toBe(true);
    const again = store.upsertProposal(proposal("p2", "billing"));
    expect(again).toMatchObject({ created: false, proposal: { id: "p1" } });
    store.upsertProposal({ ...proposal("p1", "billing"), state: "approved" });
    expect(store.getProposal("p1")?.state).toBe("approved");
    expect(store.listProposals("project-1")).toHaveLength(1);
  });

  test("events are keyed and ordered; wake events survive pruning", () => {
    const store = new ProjectStore(new Database(":memory:"));
    store.create(project());
    const now = new Date(NOW);
    expect(store.recordEvent("project-1", { kind: "coordinator-woken", idempotencyKey: "wake-1", detail: { delivered: { m1: "completed" } } }, now)).toBe(true);
    expect(store.recordEvent("project-1", { kind: "coordinator-woken", idempotencyKey: "wake-1", detail: {} }, now)).toBe(false);
    store.recordEvent("project-1", { kind: "summary", detail: {} }, now);
    expect(store.listEvents("project-1").map((event) => [event.sequence, event.kind])).toEqual([
      [1, "coordinator-woken"],
      [2, "summary"],
    ]);
    expect(store.hasEvent("wake-1")).toBe(true);
  });

  test("events of one kind list however old, past the recent window", () => {
    const store = new ProjectStore(new Database(":memory:"));
    store.create(project());
    const now = new Date(NOW);
    store.recordEvent("project-1", { kind: "coordinator-woken", idempotencyKey: "wake-1", detail: { delivered: { m1: "completed" } } }, now);
    for (let index = 0; index < 600; index += 1) store.recordEvent("project-1", { kind: "summary", detail: {} }, now);
    store.recordEvent("project-1", { kind: "coordinator-woken", idempotencyKey: "wake-2", detail: { delivered: {} } }, now);
    expect(store.listEvents("project-1").some((event) => event.idempotencyKey === "wake-1")).toBe(false);
    expect(store.listEventsOfKind("project-1", "coordinator-woken").map((event) => event.idempotencyKey)).toEqual(["wake-1", "wake-2"]);
    expect(store.listEventsOfKind("project-2", "coordinator-woken")).toEqual([]);
  });

  test("memories start as candidates, skip duplicates, and can be accepted or removed", () => {
    const store = new ProjectStore(new Database(":memory:"));
    store.create(project());
    const memory = {
      id: "mem-1",
      projectId: "project-1",
      kind: "decision" as const,
      content: "Use the shared Table component — it handles overflow.",
      status: "candidate" as const,
      sourceMissionId: "m1",
      createdAt: NOW,
    };
    expect(store.addMemory(memory)).toBe(true);
    expect(store.addMemory({ ...memory, id: "mem-2", content: memory.content.toUpperCase() })).toBe(false);
    expect(store.listMemories("project-1", { acceptedOnly: true })).toEqual([]);
    store.setMemoryStatus("mem-1", "accepted");
    expect(store.listMemories("project-1", { acceptedOnly: true }).map((entry) => entry.id)).toEqual(["mem-1"]);
    store.setMemoryStatus("mem-1", "removed");
    expect(store.listMemories("project-1")).toEqual([]);
  });
});
