import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StageTrack } from "../src/components/agent-runs/StageTrack";
import type { StageStatus } from "../src/lib/agent-runs/domain";
import type { AgentRunStageRow } from "../src/lib/agent-runs/agent-run-view";
import { projectStageProgress, stageTicks } from "../src/lib/agent-runs/stage-progress";
import type { WorkflowStage } from "../src/lib/workflows/schema";

const TITLES = ["Understand", "Build", "Verify", "Open draft PR", "Ready for review"];

/** Rows for `statuses`, the stage at `current` in progress. */
function rows(statuses: StageStatus[], current: number): AgentRunStageRow[] {
  return statuses.map((status, index) => ({
    index,
    stage: { id: `stage-${index}`, title: TITLES[index] ?? `Stage ${index + 1}` } as unknown as WorkflowStage,
    record: null,
    status,
    attempts: status === "pending" ? 0 : 1,
    current: index === current,
    asksFirst: false,
    durationMs: null,
    evidence: [],
  }));
}

describe("stage progress", () => {
  test("starts at zero and fills one stage at a time; the running stage counts once it ends", () => {
    const first = projectStageProgress(rows(["running", "pending", "pending", "pending", "pending"], 0))!;
    expect(first.fraction).toBe(0);
    expect(first.percent).toBe(0);
    const third = projectStageProgress(rows(["completed", "completed", "running", "pending", "pending"], 2))!;
    expect(third.fraction).toBe(0.4);
    expect(third.percent).toBe(40);
    expect(third.count).toBe("3/5");
    expect(third.tone).toBe("active");
    expect(third.valueText).toBe("Stage 3 of 5, Verify, running");
  });

  test("a skipped stage is behind the run like a done one", () => {
    const progress = projectStageProgress(rows(["completed", "skipped", "running", "pending", "pending"], 2))!;
    expect(progress.fraction).toBe(0.4);
    const skippedLast = projectStageProgress(rows(["completed", "completed", "completed", "completed", "skipped"], 4))!;
    expect(skippedLast.fraction).toBe(1);
  });

  test("a finished run is full and reads done", () => {
    const done = projectStageProgress(rows(["completed", "completed", "completed", "completed", "completed"], 4))!;
    expect(done.fraction).toBe(1);
    expect(done.percent).toBe(100);
    expect(done.tone).toBe("done");
    expect(done.valueText).toBe("Stage 5 of 5, Ready for review, done");
  });

  test("a blocked, stuck or cancelled stage holds the fill where it stopped", () => {
    for (const status of ["blocked", "stuck"] as const) {
      const progress = projectStageProgress(rows(["completed", "completed", "completed", status, "pending"], 3))!;
      expect(progress.fraction).toBe(0.6);
      expect(progress.tone).toBe("attention");
    }
    const cancelled = projectStageProgress(rows(["completed", "cancelled", "pending", "pending", "pending"], 1))!;
    expect(cancelled.fraction).toBe(0.2);
    expect(cancelled.tone).toBe("skipped");
    // A stopped agent run's cancelled stage reads as the failure it is.
    const stopped = projectStageProgress(rows(["completed", "cancelled", "pending", "pending", "pending"], 1), { tone: "attention" })!;
    expect(stopped.fraction).toBe(0.2);
    expect(stopped.tone).toBe("attention");
  });

  test("a paused run waits; a sign-off waits; a stage about to start reads as the run", () => {
    const paused = projectStageProgress(rows(["completed", "running", "pending"], 1), { paused: true })!;
    expect(paused.tone).toBe("waiting");
    expect(paused.statusLabel).toBe("Paused");
    expect(paused.valueText).toBe("Stage 2 of 3, Build, paused");
    const signOff = projectStageProgress(rows(["completed", "awaiting-sign-off", "pending"], 1))!;
    expect(signOff.tone).toBe("waiting");
    expect(signOff.fraction).toBeCloseTo(1 / 3);
    expect(projectStageProgress(rows(["completed", "pending", "pending"], 1))!.tone).toBe("active");
    // Pause does not soften a stage that already needs attention.
    expect(projectStageProgress(rows(["completed", "stuck", "pending"], 1), { paused: true })!.tone).toBe("attention");
  });

  test("no stages, no progress", () => {
    expect(projectStageProgress([])).toBeNull();
  });

  test("ticks mark the boundaries between stages, not the ends", () => {
    expect(stageTicks(5)).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(stageTicks(2)).toEqual([0.5]);
    expect(stageTicks(1)).toEqual([]);
  });
});

describe("stage track", () => {
  test("is a determinate progressbar with its value in words, the stage and count beside it, plus every stage as a list", () => {
    const html = renderToStaticMarkup(
      createElement(StageTrack, { rows: rows(["completed", "completed", "running", "pending", "pending"], 2) }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-valuetext="Stage 3 of 5, Verify, running"');
    expect(html).not.toContain("<canvas");
    expect(html).toContain('data-stage-tone="active"');
    expect(html).toContain(">Verify</span>");
    expect(html).toContain(">3/5</span>");
    expect(html).toContain("<ol");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("3. Verify — Running");
    expect(html).toContain("40%");
  });
});
