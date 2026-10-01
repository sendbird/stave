import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { buildAgentRunStartInput } from "../src/lib/missions/agent-run";
import { createMission } from "../src/lib/missions/domain";
import { resolveConsentStageSignOff } from "../src/lib/missions/policy";
import { MISSION_NOW } from "./fixtures/mission-fixtures";

const shipper = getBuiltinAgent("shipper")!;

function start(checkIns?: "when-stuck" | "plan-and-publishing") {
  const input = buildAgentRunStartInput({
    workspaceId: "ws-1",
    taskId: "task-1",
    agent: { ...shipper, ...(checkIns ? { checkIns } : {}) },
    assignment: "  Ship the CSV export.  ",
    now: MISSION_NOW,
  });
  return createMission({
    id: "mission-1",
    input,
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: MISSION_NOW,
  }).mission;
}

describe("run start consent", () => {
  test("a saved agent never grants permissions; every run start records its own consent", () => {
    // The agent's own permission is Auto; the run records the user's settings.
    expect(shipper.permission).toBe("auto");
    const mission = start("plan-and-publishing");
    expect(mission.consent).toEqual({ checkIns: "plan-and-publishing", permissionMode: "manual", authorizedEffectStageIds: [] });
    expect(mission.assignment).toBe("Ship the CSV export.");

    // The runtime derives a turn's permissions from the mission's consent only.
    const runtimeSource = readFileSync("electron/host-service/supervision/mission-runtime.ts", "utf8");
    expect(runtimeSource).toContain("mission.consent.permissionMode");
    expect(runtimeSource).not.toMatch(/playbook\.runtime/);

    // An external effect the consent does not list always asks first.
    const openPr = mission.playbook.stages.findIndex((stage) => stage.id === "open-draft-pr");
    expect(resolveConsentStageSignOff(mission, openPr)).toBe("ask");
  });

  test("only when stuck: assigning the work is the go-ahead for the workflow's publishing stages", () => {
    const mission = start();
    expect(mission.consent.authorizedEffectStageIds).toEqual(["open-draft-pr", "watch-checks", "ready-for-review"]);
    mission.playbook.stages.forEach((_, index) => expect(resolveConsentStageSignOff(mission, index)).toBe("auto"));
  });
});
