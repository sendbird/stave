import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionDetailView } from "../src/components/missions/MissionPanel";
import {
  describeSignOffAction,
  SignOffCard,
  summarizePreviousStage,
} from "../src/components/missions/SignOffCard";
import type { MissionDetail } from "../src/lib/missions/api";
import { projectMissionStages } from "../src/lib/missions/mission-view";
import { starterPlaybook } from "./fixtures/mission-fixtures";
import {
  COMPLETE_REPORT,
  MISSION_NOW,
  missionDetail,
  missionEvent,
  missionFixture,
} from "./fixtures/mission-fixtures";

const NOW = MISSION_NOW.getTime() + 20 * 60_000;

function detailAtBuild(
  status: "running" | "awaiting-sign-off" = "running",
  mission: Partial<MissionDetail["mission"]> = {},
): MissionDetail {
  const aggregate = missionFixture();
  const understand = aggregate.stages[0]!;
  return missionDetail(
    {
      mission: { ...aggregate.mission, currentStageIndex: 1, ...mission },
      stages: [
        {
          ...understand,
          status: "completed",
          report: {
            ...COMPLETE_REPORT,
            decisions: [{ decision: "Reuse the table model", reason: "It already has the rows." }],
            evidence: [
              { label: "Looked right at 375px", kind: "observation" },
              { label: "Tests pass", kind: "check", command: "bun test", toolCallId: "call-1" },
            ],
          },
          reportRevision: 1,
          startedAt: MISSION_NOW.toISOString(),
          endedAt: new Date(MISSION_NOW.getTime() + 3 * 60_000).toISOString(),
          facts: {
            diff: { filesChanged: 4, insertions: 82, deletions: 17 },
            commands: [{ command: "bun test", exitCode: 0, toolCallId: "call-1" }],
            toolCalls: [],
            action: null,
          },
        },
        { ...understand, stageId: "build", status, report: null, reportRevision: 0 },
      ],
    },
    [missionEvent("sign-off", { stageId: "understand", attempt: 1 })],
  );
}

function renderPanel(detail: MissionDetail) {
  return renderToStaticMarkup(
    createElement(MissionDetailView, {
      detail,
      now: NOW,
      onCommand: (async () => ({ ok: true, mission: null })) as never,
      onShowTool: () => {},
    }),
  );
}

describe("Mission panel", () => {
  test("goal, status and done-when come before the stage cards", () => {
    const html = renderPanel(detailAtBuild());
    const order = ["Goal", "Add CSV export", "Status", "Done when", "Export button exists", "1. Understand"];
    const positions = order.map((text) => html.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Signed off by you at");
    expect(html).toContain("not verified");
  });

  test("the current stage opens with its instruction; controls follow the state", () => {
    const running = renderPanel(detailAtBuild());
    expect(running).toContain("Implement the smallest complete change");
    expect(running).toContain("Pause");
    expect(running).toContain("Cancel mission");
    expect(running).not.toContain("Resume");

    const paused = renderPanel(
      detailAtBuild("running", { state: "paused", pauseReason: "paused-by-user", reasonDetail: "Paused by the user." }),
    );
    expect(paused).toContain("Resume");
    expect(paused).not.toContain(">Pause<");

    const runtime = renderPanel(
      detailAtBuild("running", {
        state: "paused",
        pauseReason: "runtime-changed",
        reasonDetail: "The lead task now runs on codex:gpt-6.",
      }),
    );
    expect(runtime).toContain("Apply to remaining stages");
    expect(runtime).not.toContain("Resume");
  });

  test("a finished mission is static and shows no controls", () => {
    const html = renderPanel(detailAtBuild("running", { state: "completed" }));
    expect(html).not.toContain("Cancel mission");
    expect(html).toContain("Mission complete");
  });
});

describe("sign-off card", () => {
  test("the primary button names what happens next", () => {
    const playbook = starterPlaybook("request-to-pr");
    expect(playbook.stages.map(describeSignOffAction)).toEqual([
      "Start Understand",
      "Start Build",
      "Start Verify",
      "Open the draft PR",
      "Start watching checks",
      "Mark ready for review",
    ]);
  });

  test("it cites the stage before it and offers review and changes", () => {
    const detail = detailAtBuild("awaiting-sign-off");
    const rows = projectMissionStages(detail, new Date(NOW));
    expect(summarizePreviousStage(rows[0])).toBe("Understand done · 4 files +82 −17 · 1 verified by Stave");
    const html = renderToStaticMarkup(
      createElement(SignOffCard, {
        detail,
        onSignOff: () => {},
        onAskForChanges: () => {},
        onReviewChanges: () => {},
      }),
    );
    expect(html).toContain("Build — waiting for your sign-off");
    expect(html).toContain("Start Build");
    expect(html).toContain("Review changes");
    expect(html).toContain("Ask for changes");
    expect(html).toContain("Restated the request and wrote criteria.");
  });

  test("without an earlier AI stage there is nothing to ask changes of", () => {
    const aggregate = missionFixture();
    const detail = missionDetail({
      ...aggregate,
      stages: [{ ...aggregate.stages[0]!, status: "awaiting-sign-off" }],
    });
    const html = renderToStaticMarkup(
      createElement(SignOffCard, {
        detail,
        onSignOff: () => {},
        onAskForChanges: () => {},
        onReviewChanges: () => {},
      }),
    );
    expect(html).not.toContain("Ask for changes");
  });
});
