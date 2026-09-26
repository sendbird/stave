import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { missionPermissionRuntimeOptions } from "../src/lib/missions/briefing";
import { createMission } from "../src/lib/missions/domain";
import { resolveConsentStageSignOff } from "../src/lib/missions/policy";
import {
  buildMissionStartInput,
  defaultAuthorizedEffects,
  describeMissionStops,
  describeStartButton,
  listMissionStops,
} from "../src/lib/missions/start-sheet";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

describe("mission start consent", () => {
  test("a saved playbook never grants permissions; every mission start records its own consent", () => {
    // The playbook's saved default says Auto; the Start sheet chose Guided.
    const playbook = { ...starterPlaybook("request-to-pr"), runtime: { providerId: "claude-code" as const, permissionMode: "auto" as const } };
    const input = buildMissionStartInput({
      workspaceId: "ws-1",
      taskId: "task-1",
      playbook,
      assignment: "  Add CSV export.  ",
      consent: { checkIns: "every-stage", permissionMode: "guided", authorizedEffectStageIds: [] },
    });
    expect(input.consent).toEqual({ checkIns: "every-stage", permissionMode: "guided", authorizedEffectStageIds: [] });
    expect(input.assignment).toBe("Add CSV export.");

    const { mission } = createMission({
      id: "mission-1",
      input,
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    // The mission keeps the consent of its own start, not the playbook default.
    expect(mission.consent.permissionMode).toBe("guided");
    expect(missionPermissionRuntimeOptions("claude-code", mission.consent.permissionMode)).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });

    // The runtime derives a turn's permissions from the mission's consent only.
    const runtimeSource = readFileSync("electron/host-service/supervision/mission-runtime.ts", "utf8");
    expect(runtimeSource).toContain("mission.consent.permissionMode");
    expect(runtimeSource).not.toMatch(/playbook\.runtime/);

    // And an external effect the consent does not list always asks first.
    const openPr = playbook.stages.findIndex((stage) => stage.kind === "action" && stage.action.type === "open-draft-pr");
    expect(resolveConsentStageSignOff(mission, openPr)).toBe("ask");
  });

  test("consent names only stages this playbook has", () => {
    const playbook = starterPlaybook("request-to-pr");
    const input = buildMissionStartInput({
      workspaceId: "ws-1",
      taskId: "task-1",
      playbook,
      assignment: "x",
      consent: {
        checkIns: "plan-and-publishing",
        permissionMode: "guided",
        authorizedEffectStageIds: [...defaultAuthorizedEffects(playbook), "not-a-stage"],
      },
    });
    expect(input.consent.authorizedEffectStageIds).toEqual(defaultAuthorizedEffects(playbook));
  });
});

describe("start sheet wording", () => {
  const playbook = starterPlaybook("request-to-pr");
  const authorized = defaultAuthorizedEffects(playbook);

  test("the primary button names where the mission stops", () => {
    const planAndPublishing = { checkIns: "plan-and-publishing" as const, permissionMode: "guided" as const, authorizedEffectStageIds: authorized };
    const stops = listMissionStops(playbook, planAndPublishing).map((index) => playbook.stages[index]!.title);
    expect(stops).toEqual(["Build", "Ready for review"]);
    expect(describeStartButton(playbook, planAndPublishing)).toBe("Start — asks before Build and Ready for review");
    expect(describeMissionStops(playbook, planAndPublishing)).toBe(
      "Stave asks you before Build and Ready for review.",
    );

    const whenStuck = { ...planAndPublishing, checkIns: "when-stuck" as const };
    expect(describeStartButton(playbook, whenStuck)).toBe("Start — runs to the end");

    const everyStage = { ...planAndPublishing, checkIns: "every-stage" as const };
    expect(describeStartButton(playbook, everyStage)).toBe(`Start — asks ${playbook.stages.length - 1} times`);
  });

  test("withholding consent from a stage makes it ask, even when stuck-only", () => {
    const openPr = playbook.stages.find((stage) => stage.kind === "action" && stage.action.type === "open-draft-pr")!;
    const consent = {
      checkIns: "when-stuck" as const,
      permissionMode: "guided" as const,
      authorizedEffectStageIds: authorized.filter((id) => id !== openPr.id),
    };
    expect(listMissionStops(playbook, consent).map((index) => playbook.stages[index]!.id)).toEqual([openPr.id]);
  });
});
