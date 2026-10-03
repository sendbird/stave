import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StageTrack } from "../src/components/missions/StageTrack";
import {
  BAYER_8,
  ditherDensity,
  ditherThreshold,
  easeStandard,
  isCellLit,
  shimmerOffset,
} from "../src/components/missions/dither-progress.paint";
import type { StageStatus } from "../src/lib/missions/domain";
import type { MissionStageRow } from "../src/lib/missions/mission-view";
import { clampHeadLabel, projectStageProgress, stageTicks } from "../src/lib/missions/stage-progress";
import type { WorkflowStage } from "../src/lib/workflows/schema";

const TITLES = ["Understand", "Build", "Verify", "Open draft PR", "Ready for review"];

/** Rows for `statuses`, the stage at `current` in progress. */
function rows(statuses: StageStatus[], current: number): MissionStageRow[] {
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
    // A stopped mission's cancelled stage reads as the failure it is.
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

  test("the head label starts at the head and stays inside the track", () => {
    expect(clampHeadLabel(0, 80, 300)).toBe(0);
    expect(clampHeadLabel(120, 80, 300)).toBe(120);
    expect(clampHeadLabel(260, 80, 300)).toBe(220);
    expect(clampHeadLabel(300, 80, 300)).toBe(220);
    // Wider than the track: it starts at zero rather than off the left edge.
    expect(clampHeadLabel(150, 340, 300)).toBe(0);
  });
});

describe("dither", () => {
  test("the Bayer matrix holds every threshold once", () => {
    expect([...BAYER_8.flat()].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, index) => index));
  });

  test("thresholds are deterministic and tile every 8 cells", () => {
    expect(ditherThreshold(3, 5)).toBe(ditherThreshold(3, 5));
    expect(ditherThreshold(3, 5)).toBe(ditherThreshold(11, 13));
    expect(ditherThreshold(-1, -1)).toBe(ditherThreshold(7, 7));
    expect(ditherThreshold(0, 0)).toBe(0.5 / 64);
    expect(ditherThreshold(0, 7)).toBe(63.5 / 64);
  });

  test("a density lights that share of every 8×8 block", () => {
    const lit = (density: number, originColumn = 0, originRow = 0) => {
      let count = 0;
      for (let row = 0; row < 8; row += 1)
        for (let column = 0; column < 8; column += 1)
          if (isCellLit(originColumn + column, originRow + row, density)) count += 1;
      return count;
    };
    expect(lit(0.5)).toBe(32);
    expect(lit(0.5, 24, 8)).toBe(32);
    expect(lit(0.25)).toBe(16);
    expect(lit(0)).toBe(0);
    expect(lit(1)).toBe(64);
  });

  test("the fill is sparse at its start and dense at its head", () => {
    const ramp = [0, 0.25, 0.5, 0.75, 1].map(ditherDensity);
    expect(ramp[0]).toBeGreaterThan(0);
    expect(ramp[4]).toBeLessThan(1);
    for (let index = 1; index < ramp.length; index += 1) expect(ramp[index]!).toBeGreaterThan(ramp[index - 1]!);
    expect(ramp[4]! - ramp[0]!).toBeGreaterThan(0.6);
  });

  test("only the newest cells shimmer", () => {
    expect(shimmerOffset(4, 2, 40, 1_000)).toBe(0);
    const near = [0, 300, 600, 900].map((time) => shimmerOffset(4, 2, 2, time));
    expect(new Set(near).size).toBeGreaterThan(1);
    for (const offset of near) expect(Math.abs(offset)).toBeLessThanOrEqual(0.12);
  });

  test("the fill eases out on the standard curve", () => {
    expect(easeStandard(0)).toBe(0);
    expect(easeStandard(1)).toBe(1);
    expect(easeStandard(0.5)).toBeGreaterThan(0.75);
    let previous = 0;
    for (let step = 1; step <= 20; step += 1) {
      const value = easeStandard(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("stage track", () => {
  test("is a progressbar with its value in words, plus every stage as a list", () => {
    const html = renderToStaticMarkup(
      createElement(StageTrack, { rows: rows(["completed", "completed", "running", "pending", "pending"], 2) }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-valuetext="Stage 3 of 5, Verify, running"');
    expect(html).toMatch(/<canvas aria-hidden="true"/);
    expect(html).toContain("<ol");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("3. Verify — Running");
    expect(html).toContain("40%");
  });
});
