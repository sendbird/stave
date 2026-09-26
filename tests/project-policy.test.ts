import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_SETTINGS, type MissionProposal, type Project, type ProjectEvent } from "../src/lib/projects/domain";
import {
  buildCoordinatorWakePrompt,
  collectDeliveredStates,
  decideProject,
  missionStateKey,
  type ProjectMissionSnapshot,
} from "../src/lib/projects/policy";
import { starterPlaybook } from "./fixtures/mission-fixtures";

const NOW = "2026-09-26T10:00:00.000Z";

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Design system move",
    goal: "Every dashboard screen uses the new components.",
    repositoryPath: "/tmp/repo",
    coordinator: { workspaceId: "ws-1", taskId: "coord-1" },
    settings: DEFAULT_PROJECT_SETTINGS,
    state: "active",
    summary: null,
    reasonDetail: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function proposal(id: string, state: MissionProposal["state"], createdAt = NOW): MissionProposal {
  return {
    id,
    projectId: "project-1",
    startKey: `key-${id}`,
    playbook: starterPlaybook("request-to-pr"),
    assignment: `Move ${id} to the new components.`,
    providerId: "claude-code",
    model: null,
    worktreeName: null,
    state,
    workspaceId: null,
    taskId: null,
    missionId: null,
    detail: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function mission(id: string, state: ProjectMissionSnapshot["state"], stage: ProjectMissionSnapshot["currentStageStatus"] = "running"): ProjectMissionSnapshot {
  return { missionId: id, state, currentStageStatus: stage, title: `Mission ${id}`, summary: `Summary ${id}` };
}

function woken(delivered: Record<string, string>, sequence = 1): ProjectEvent {
  return {
    id: `event-${sequence}`,
    projectId: "project-1",
    sequence,
    kind: "coordinator-woken",
    idempotencyKey: null,
    detail: { delivered },
    createdAt: NOW,
  };
}

describe("project policy", () => {
  test("approved missions start oldest first, up to the parallel limit", () => {
    const decision = decideProject({
      project: project(),
      proposals: [proposal("b", "approved", "2026-09-26T10:05:00.000Z"), proposal("a", "approved"), proposal("c", "pending")],
      missions: [],
      delivered: {},
      coordinatorBusy: false,
    });
    expect(decision).toEqual({ action: "start-proposal", proposalId: "a" });

    const full = decideProject({
      project: project(),
      proposals: [proposal("a", "approved")],
      missions: [mission("m1", "running"), mission("m2", "paused")],
      delivered: {},
      coordinatorBusy: false,
    });
    expect(full.action).toBe("idle");
  });

  test("the coordinator wakes once for every batch of changes it has not seen", () => {
    const missions = [mission("m1", "completed"), mission("m2", "running", "awaiting-sign-off"), mission("m3", "running")];
    const decision = decideProject({ project: project(), proposals: [], missions, delivered: {}, coordinatorBusy: false });
    expect(decision.action).toBe("wake-coordinator");
    if (decision.action !== "wake-coordinator") return;
    expect(decision.changes.map((change) => [change.missionId, change.stateKey])).toEqual([
      ["m1", "completed"],
      ["m2", "awaiting-sign-off"],
    ]);
    expect(decision.key).toBe("project:project-1:wake:m1=completed,m2=awaiting-sign-off");

    // Exactly once per state: once delivered, the same states wake nothing.
    const delivered = collectDeliveredStates([woken({ m1: "completed", m2: "awaiting-sign-off" })]);
    expect(decideProject({ project: project(), proposals: [], missions, delivered, coordinatorBusy: false }).action).toBe("idle");

    // A new state of a delivered mission wakes again.
    const next = decideProject({
      project: project(),
      proposals: [],
      missions: [mission("m1", "completed"), mission("m2", "completed")],
      delivered,
      coordinatorBusy: false,
    });
    expect(next).toMatchObject({ action: "wake-coordinator", changes: [{ missionId: "m2", stateKey: "completed" }] });
  });

  test("a busy coordinator or a paused project waits", () => {
    const missions = [mission("m1", "completed")];
    expect(decideProject({ project: project(), proposals: [], missions, delivered: {}, coordinatorBusy: true }).action).toBe("wait");
    expect(
      decideProject({ project: project({ state: "paused" }), proposals: [proposal("a", "approved")], missions, delivered: {}, coordinatorBusy: false })
        .action,
    ).toBe("wait");
  });

  test("only states worth a decision wake the coordinator", () => {
    expect(missionStateKey({ state: "running", currentStageStatus: "running" })).toBeNull();
    expect(missionStateKey({ state: "running", currentStageStatus: "stuck" })).toBe("stuck");
    expect(missionStateKey({ state: "paused", currentStageStatus: "running" })).toBeNull();
    expect(missionStateKey({ state: "stopped", currentStageStatus: "running" })).toBe("stopped");
  });

  test("the wake prompt carries identities, states and summaries, never transcripts", () => {
    const prompt = buildCoordinatorWakePrompt([
      { missionId: "m1", title: "Billing table", stateKey: "completed", summary: "PR #612 ready." },
      { missionId: "m2", title: "Settings form", stateKey: "awaiting-sign-off", summary: null },
    ]);
    expect(prompt).toContain("- Billing table (m1) completed: PR #612 ready.");
    expect(prompt).toContain("- Settings form (m2) waits for the user's sign-off");
    expect(prompt).toContain("stave_get_mission_report");
    expect(prompt).toContain("Do not edit files yourself.");
  });
});
