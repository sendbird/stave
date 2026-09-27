import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_SETTINGS, type MissionProposal, type Project, type ProjectEvent } from "../src/lib/projects/domain";
import {
  buildCoordinatorWakePrompt,
  collectDeliveredStates,
  countWakesTowardCap,
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

function mission(
  id: string,
  state: ProjectMissionSnapshot["state"],
  stage: ProjectMissionSnapshot["currentStageStatus"] = "running",
  at: { stageIndex?: number; attempt?: number } = {},
): ProjectMissionSnapshot {
  return {
    missionId: id,
    state,
    currentStageStatus: stage,
    stageIndex: at.stageIndex ?? 1,
    attempt: at.attempt ?? 1,
    title: `Mission ${id}`,
    summary: `Summary ${id}`,
  };
}

function woken(delivered: Record<string, string>, sequence = 1, createdAt = NOW): ProjectEvent {
  return {
    id: `event-${sequence}`,
    projectId: "project-1",
    sequence,
    kind: "coordinator-woken",
    idempotencyKey: null,
    detail: { delivered },
    createdAt,
  };
}

function decideWith(missions: ProjectMissionSnapshot[], wakes: ProjectEvent[]) {
  return decideProject({
    project: project(),
    proposals: [],
    missions,
    delivered: collectDeliveredStates(wakes),
    previousWakes: wakes.length,
    coordinatorBusy: false,
  });
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
      ["m2", "awaiting-sign-off@2#1"],
    ]);
    expect(decision.key).toBe("project:project-1:wake:1");

    // Exactly once per state: once delivered, the same states wake nothing.
    const delivered = collectDeliveredStates([woken({ m1: "completed", m2: "awaiting-sign-off@2#1" })]);
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

  test("only states worth a decision wake the coordinator, named by stage and attempt", () => {
    const at = { stageIndex: 2, attempt: 3 };
    expect(missionStateKey({ state: "running", currentStageStatus: "running", ...at })).toBeNull();
    expect(missionStateKey({ state: "running", currentStageStatus: "stuck", ...at })).toBe("stuck@3#3");
    expect(missionStateKey({ state: "paused", currentStageStatus: "running", ...at })).toBeNull();
    expect(missionStateKey({ state: "stopped", currentStageStatus: "running", ...at })).toBe("stopped");
  });

  test("a mission back in a state it was in before wakes the coordinator again", () => {
    // Sign-off at stage 2, then blocked there, then a sign-off at stage 3.
    const first = decideWith([mission("m1", "running", "awaiting-sign-off", { stageIndex: 1 })], []);
    expect(first).toMatchObject({ action: "wake-coordinator", key: "project:project-1:wake:1" });
    const wakes = [woken({ m1: "awaiting-sign-off@2#1" }, 1)];
    const blocked = decideWith([mission("m1", "running", "blocked", { stageIndex: 1 })], wakes);
    expect(blocked).toMatchObject({ action: "wake-coordinator", key: "project:project-1:wake:2", changes: [{ stateKey: "blocked@2#1" }] });
    wakes.push(woken({ m1: "blocked@2#1" }, 2));
    const later = decideWith([mission("m1", "running", "awaiting-sign-off", { stageIndex: 2 })], wakes);
    expect(later).toMatchObject({ action: "wake-coordinator", key: "project:project-1:wake:3", changes: [{ stateKey: "awaiting-sign-off@3#1" }] });
    // A retried stage is a new attempt: blocked again is news.
    wakes.push(woken({ m1: "blocked@2#2" }, 3));
    expect(decideWith([mission("m1", "running", "blocked", { stageIndex: 1, attempt: 2 })], wakes).action).toBe("idle");
    expect(decideWith([mission("m1", "running", "blocked", { stageIndex: 1, attempt: 3 })], wakes)).toMatchObject({
      action: "wake-coordinator",
      key: "project:project-1:wake:4",
    });
    // The same wake computed twice keeps its key, so it is recorded once.
    expect(decideWith([mission("m1", "running", "blocked", { stageIndex: 1, attempt: 3 })], wakes)).toMatchObject({
      key: "project:project-1:wake:4",
    });
  });

  test("the first wake plans the project, before anything else it would carry", () => {
    const observation = {
      project: project(),
      proposals: [],
      missions: [mission("m1", "completed")],
      delivered: {},
      kickoffPending: true,
    };
    expect(decideProject({ ...observation, coordinatorBusy: true }).action).toBe("wait");
    expect(decideProject({ ...observation, coordinatorBusy: false })).toEqual({
      action: "wake-coordinator",
      kickoff: true,
      changes: [],
      triggers: [],
      key: "project:project-1:kickoff",
    });
  });

  test("the daily cap counts the last day's automatic turns, and only those since the user resumed", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const wakes = [
      woken({}, 1, "2026-09-25T11:00:00.000Z"),
      woken({}, 2, "2026-09-26T09:00:00.000Z"),
      woken({}, 3, "2026-09-26T11:00:00.000Z"),
    ];
    expect(countWakesTowardCap(wakes, { now })).toBe(2);
    expect(countWakesTowardCap(wakes, { now, resetAt: "2026-09-26T10:00:00.000Z" })).toBe(1);
    expect(countWakesTowardCap(wakes, { now, resetAt: null })).toBe(2);
  });

  test("the wake prompt carries identities, states and summaries, never transcripts", () => {
    const prompt = buildCoordinatorWakePrompt([
      { missionId: "m1", title: "Billing table", stateKey: "completed", summary: "PR #612 ready." },
      { missionId: "m2", title: "Settings form", stateKey: "awaiting-sign-off@4#1", summary: null },
    ]);
    expect(prompt).toContain("- Billing table (m1) completed: PR #612 ready.");
    expect(prompt).toContain("- Settings form (m2) waits for the user's sign-off");
    expect(prompt).toContain("stave_get_mission_report");
    expect(prompt).toContain("Do not edit files yourself.");
  });
});
