import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationLatestRun } from "@/components/layout/automation-center/AutomationLatestRun";
import type { RoutineRun } from "@/lib/routines";

function buildRun(overrides: Partial<RoutineRun> = {}): RoutineRun {
  return {
    id: "run-1",
    routineId: "routine-1",
    workspaceId: "workspace-1",
    projectPath: "/tmp/project",
    taskId: "task-1",
    turnId: "turn-1",
    status: "completed",
    trigger: "manual",
    scheduledFor: null,
    startedAt: "2026-07-29T00:00:00.000Z",
    completedAt: "2026-07-29T00:01:05.000Z",
    resultPreview: "No blocking risks found.",
    error: null,
    configHash: "1234567890abcdef",
    trustPolicy: "review-required",
    ...overrides,
  };
}

function renderSummary(run: RoutineRun | null) {
  return renderToStaticMarkup(
    createElement(AutomationLatestRun, {
      run,
      onOpenTask: () => {},
      onOpenDetail: () => {},
    }),
  );
}

describe("Automation latest run summary", () => {
  test("shows concise run context and an Open task action", () => {
    const html = renderSummary(buildRun());

    expect(html).toContain("Completed");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Manual");
    expect(html).toContain("1m 5s");
    expect(html).toContain("No blocking risks found.");
    expect(html).toContain("Open task");
    expect(html).toContain("Open run detail");
  });

  test("omits Open task when no task was created for the run", () => {
    const html = renderSummary(
      buildRun({
        taskId: null,
        turnId: null,
        status: "skipped",
        trigger: "scheduled",
        resultPreview: null,
        error: "Skipped because the concurrency limit was reached.",
      }),
    );

    expect(html).toContain("Skipped");
    expect(html).toContain("Scheduled");
    expect(html).toContain(
      "Skipped because the concurrency limit was reached.",
    );
    expect(html).not.toContain("Open task");
    expect(html).toContain("Open run detail");
  });

  test("keeps the existing empty state before the first run", () => {
    const html = renderSummary(null);

    expect(html).toContain("No runs yet.");
    expect(html).not.toContain("Open task");
  });
});
