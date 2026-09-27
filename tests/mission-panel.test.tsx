import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionDetailView } from "../src/components/missions/MissionPanel";
import { shouldOpenStage } from "../src/components/missions/StageCard";
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
  test("the goal heads the panel, then status, done-when and the stage timeline", () => {
    const html = renderPanel(detailAtBuild());
    const order = ["Mission · Request → PR", "Add CSV export", "Running", "Done when", "Export button exists", ">Stages<"];
    const positions = order.map((text) => html.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.indexOf("Understand", html.indexOf(">Stages<"))).toBeGreaterThan(-1);
    expect(html).toContain("Signed off by you at");
    expect(html).toContain("Not verified");
    expect(html).toContain("Stage 2 of 6");
    // The timeline is a list with the current stage marked.
    expect(html).toContain('role="list"');
    expect(html.match(/role="listitem"[^>]*aria-current="step"/g)).toHaveLength(1);
  });

  test("the current stage opens and says what to expect; controls follow the state", () => {
    const running = renderPanel(detailAtBuild());
    expect(running).toContain("In progress");
    expect(running).toContain("Instruction");
    // The instruction is folded until asked for.
    expect(running).not.toContain("Implement the smallest complete change");
    expect(running).toContain(">Pause<");
    expect(running).toContain('aria-label="More mission actions"');
    expect(running).not.toContain(">Resume<");

    const paused = renderPanel(
      detailAtBuild("running", { state: "paused", pauseReason: "paused-by-user", reasonDetail: "Paused by the user." }),
    );
    expect(paused).toContain(">Resume<");
    expect(paused).not.toContain(">Pause<");

    const runtime = renderPanel(
      detailAtBuild("running", {
        state: "paused",
        pauseReason: "runtime-changed",
        reasonDetail: "The lead task now runs on codex:gpt-6.",
      }),
    );
    expect(runtime).toContain("Use it for the remaining stages");
    expect(runtime).toContain("The lead task now runs on codex:gpt-6.");
    expect(runtime).not.toContain(">Resume<");
  });

  test("a stage card opens when its stage becomes current or needs recovering", () => {
    const idle = { current: false, recoverable: false };
    const current = { current: true, recoverable: false };
    const recoverable = { current: true, recoverable: true };
    expect(shouldOpenStage(idle, current)).toBe(true);
    expect(shouldOpenStage(idle, recoverable)).toBe(true);
    expect(shouldOpenStage(current, recoverable)).toBe(true);
    // Staying as it was, or moving on, leaves the user's choice alone.
    expect(shouldOpenStage(current, current)).toBe(false);
    expect(shouldOpenStage(recoverable, current)).toBe(false);
    expect(shouldOpenStage(current, idle)).toBe(false);
  });

  test("a finished mission is static and shows no controls", () => {
    const html = renderPanel(detailAtBuild("running", { state: "completed" }));
    expect(html).not.toContain("More mission actions");
    expect(html).not.toContain(">Pause<");
    expect(html).toContain("Completed");
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
    expect(html).toContain("Ready to start Build?");
    expect(html).toContain("Stage 2 of 6");
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
