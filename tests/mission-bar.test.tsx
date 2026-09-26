import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionBarView } from "../src/components/missions/MissionBar";
import type { MissionDetail } from "../src/lib/missions/api";
import {
  buildMissionTurnDividers,
  describeMissionHeadline,
  formatAge,
  projectMissionStages,
} from "../src/lib/missions/mission-view";
import {
  COMPLETE_REPORT,
  MISSION_NOW,
  missionDetail,
  missionEvent,
  missionFixture,
} from "./fixtures/mission-fixtures";

const NOW = MISSION_NOW.getTime() + 20 * 60_000;

/** Request → PR with Understand done and Build in `status`. */
function detailAtBuild(status: "running" | "awaiting-sign-off" | "blocked" | "stuck" = "running"): MissionDetail {
  const aggregate = missionFixture();
  const understand = aggregate.stages[0]!;
  return missionDetail(
    {
      mission: { ...aggregate.mission, currentStageIndex: 1 },
      stages: [
        {
          ...understand,
          status: "completed",
          report: COMPLETE_REPORT,
          reportRevision: 1,
          startedAt: MISSION_NOW.toISOString(),
          endedAt: new Date(MISSION_NOW.getTime() + 3 * 60_000).toISOString(),
        },
        {
          ...understand,
          stageId: "build",
          status,
          report: null,
          reportRevision: 0,
          blockReason: status === "blocked" ? "agent-blocked" : null,
          detail: status === "blocked" ? "Which plan gets the export?" : null,
          startedAt: new Date(MISSION_NOW.getTime() + 4 * 60_000).toISOString(),
        },
      ],
    },
    [missionEvent("stage-completed", { stageId: "understand", attempt: 1 }, { createdAt: new Date(MISSION_NOW.getTime() + 5 * 60_000).toISOString() })],
  );
}

function render(detail: MissionDetail, nowPhrase: string | null = null) {
  return renderToStaticMarkup(
    createElement(MissionBarView, { detail, nowPhrase, now: NOW, reducedMotion: false }),
  );
}

describe("Mission bar", () => {
  test("the stage track is an ordered list with the current stage marked", () => {
    const html = render(detailAtBuild());
    expect(html).toContain("<ol");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("2. Build — Running");
    // The bar spends its width on the present; identity is in the title.
    expect(html).toContain('title="Request → PR · Add CSV export to the billing page."');
    expect(html).toContain("Stage 2 of 6");
  });

  test("a stage that asks first is marked, and every status has text", () => {
    const html = render(detailAtBuild());
    expect(html).toContain(", asks you first");
    expect(html).toContain("1. Understand — Done");
    expect(html).toContain("3. Verify — Not started");
  });

  test("while a turn runs the Now phrase leads; otherwise the state is named and aged", () => {
    expect(render(detailAtBuild(), "Running the tests")).toContain("Running the tests");
    const waiting = render(detailAtBuild("awaiting-sign-off"));
    expect(waiting).toContain(">Build<");
    expect(waiting).toContain("Waiting for your sign-off");
    expect(waiting).toContain(" · 15m");
    expect(waiting).toContain("Waiting for your sign-off: Build");
    const blocked = render(detailAtBuild("blocked"));
    expect(blocked).toContain("Blocked");
    expect(blocked).toContain("Which plan gets the export?");
  });

  test("the controls follow the mission: Take over while it runs, Resume after", () => {
    const actions = { onTakeOver: () => {}, onResume: () => {}, onOpenPanel: () => {} };
    const running = renderToStaticMarkup(
      createElement(MissionBarView, { detail: detailAtBuild(), nowPhrase: null, now: NOW, reducedMotion: false, actions }),
    );
    expect(running).toContain(">Take over<");
    expect(running).toContain('aria-label="Open the Mission panel"');
    expect(running).not.toContain(">Resume<");
    const base = detailAtBuild();
    const takenOver = renderToStaticMarkup(
      createElement(MissionBarView, {
        detail: { ...base, mission: { ...base.mission, state: "paused", pauseReason: "taken-over" } },
        nowPhrase: null,
        now: NOW,
        reducedMotion: false,
        actions,
      }),
    );
    expect(takenOver).toContain(">Resume<");
    expect(takenOver).toContain("You took over");
    expect(takenOver).toContain("2. Build — Paused");
    expect(takenOver).not.toContain(">Take over<");
  });

  test("the live region announces the stage, not the Now phrase", () => {
    const html = render(detailAtBuild(), "Running the tests");
    expect(html).toMatch(/aria-live="polite"[^>]*>Stage 2 of 6: Build</);
  });
});

describe("mission view", () => {
  test("ages read as now, seconds, minutes, hours and days", () => {
    expect([2_000, 45_000, 6 * 60_000, 2 * 3_600_000, 3 * 86_400_000].map(formatAge)).toEqual([
      "now",
      "45s",
      "6m",
      "2h",
      "3d",
    ]);
  });

  test("stage rows carry durations and put Stave's evidence first", () => {
    const detail = detailAtBuild();
    const withEvidence: MissionDetail = {
      ...detail,
      stages: [
        {
          ...detail.stages[0]!,
          report: {
            ...COMPLETE_REPORT,
            evidence: [
              { label: "Looked right", kind: "observation" },
              { label: "Tests pass", kind: "check", command: "bun test" },
            ],
          },
          facts: {
            diff: null,
            commands: [{ command: "bun test", exitCode: 0, toolCallId: "call-1" }],
            toolCalls: [],
            action: null,
          },
        },
        detail.stages[1]!,
      ],
    };
    const rows = projectMissionStages(withEvidence, new Date(NOW));
    expect(rows[0]).toMatchObject({ status: "completed", durationMs: 3 * 60_000, current: false });
    expect(rows[0]!.evidence.map((item) => [item.label, item.source])).toEqual([
      ["Tests pass", "stave"],
      ["Looked right", "agent"],
    ]);
    expect(rows[1]).toMatchObject({ status: "running", current: true, asksFirst: true });
    expect(rows[5]).toMatchObject({ status: "pending", asksFirst: true });
  });

  test("the headline names paused, stopped and finished missions", () => {
    const detail = detailAtBuild();
    expect(
      describeMissionHeadline({
        ...detail,
        mission: { ...detail.mission, state: "paused", pauseReason: "taken-over", reasonDetail: "You took over." },
      }),
    ).toMatchObject({ text: "You took over.", tone: "waiting" });
    expect(
      describeMissionHeadline({
        ...detail,
        mission: { ...detail.mission, state: "stopped", stopReason: "expired", reasonDetail: "It expired." },
      }).text,
    ).toBe("Mission stopped · It expired.");
  });

  test("transcript dividers come from events: why each stage turn started", () => {
    const at = (minutes: number) => new Date(MISSION_NOW.getTime() + minutes * 60_000).toISOString();
    const detail = missionDetail(missionFixture(), [
      missionEvent("mission-started", {}, { createdAt: at(0) }),
      missionEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:understand:1:turn:1", createdAt: at(0) }),
      missionEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-1" }, { idempotencyKey: "m:understand:1:turn:1:linked", createdAt: at(0) }),
      missionEvent("stage-completed", { stageId: "understand", attempt: 1 }, { createdAt: at(3) }),
      missionEvent("sign-off", { stageId: "build", attempt: 1 }, { createdAt: at(10) }),
      missionEvent("turn-started", { stageId: "build", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:build:1:turn:2", createdAt: at(10) }),
      missionEvent("turn-linked", { stageId: "build", attempt: 1, turnId: "turn-2" }, { idempotencyKey: "m:build:1:turn:2:linked", createdAt: at(10) }),
      missionEvent("turn-started", { stageId: "build", attempt: 1, reason: "nudge" }, { idempotencyKey: "m:build:1:turn:3", createdAt: at(20) }),
      missionEvent("turn-linked", { stageId: "build", attempt: 1, turnId: "turn-3" }, { idempotencyKey: "m:build:1:turn:3:linked", createdAt: at(20) }),
      missionEvent("stage-completed", { stageId: "build", attempt: 1 }, { createdAt: at(25) }),
      missionEvent("turn-started", { stageId: "verify", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:verify:1:turn:4", createdAt: at(25) }),
      missionEvent("turn-linked", { stageId: "verify", attempt: 1, turnId: "turn-4" }, { idempotencyKey: "m:verify:1:turn:4:linked", createdAt: at(25) }),
    ]);
    const dividers = buildMissionTurnDividers(detail, () => "13:41");
    expect(Object.fromEntries(dividers)).toEqual({
      "turn-1": "Stage 1 · Understand — mission started",
      "turn-2": "Stage 2 · Build — signed off by you at 13:41",
      "turn-3": "Stage 2 · Build — reminder to report the stage",
      "turn-4": "Stage 3 · Verify — started automatically after Build reported done",
    });
  });
});
