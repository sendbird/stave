import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WakeUpSectionView } from "../src/components/agent-runs/WakeUpSection";
import { AgentRunReportView } from "../src/components/agent-runs/AgentRunReportView";
import {
  decisionsAsMemoryFacts,
  reportMentionsPullRequest,
} from "../src/components/agent-runs/useAgentRunReportActions";
import type { AgentRunReport } from "../src/lib/agent-runs/report";
import { mergeReportIntoPullRequestBody } from "../src/lib/agent-runs/report-markdown";
import type { WakeUp, WakeUpSummary } from "../src/lib/supervision/wake-up-policy";
import {
  describeWakeUpHistory,
  describeWakeUpStatus,
  describeWakeUpTrigger,
} from "../src/lib/supervision/wake-up-view";
import { useWakeUpsStore, wakeUpTaskKey } from "../src/store/wake-ups-store";

const NOW = Date.parse("2026-09-26T10:00:00.000Z");

const WAKE_UP = {
  id: "wake-1",
  workspaceId: "ws-1",
  taskId: "task-1",
  trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
} as unknown as WakeUp;

function summary(patch: Partial<WakeUpSummary> = {}): WakeUpSummary {
  return {
    wakeUpId: "wake-1",
    taskId: "task-1",
    triggerKind: "schedule",
    state: "scheduled",
    reason: null,
    nextRunAt: new Date(NOW + 12 * 60_000).toISOString(),
    occurrenceCount: 3,
    skippedCount: 1,
    ...patch,
  };
}

afterEach(() => {
  useWakeUpsStore.setState({ workspaceId: null, byTask: {}, pendingById: {}, failureById: {} });
});

describe("wake-ups on the task surfaces", () => {
  test("the trigger, where it stands and its history read as sentences", () => {
    expect(describeWakeUpTrigger(WAKE_UP)).toBe("Every hour");
    expect(
      describeWakeUpTrigger({ ...WAKE_UP, trigger: { kind: "completion" } } as WakeUp),
    ).toBe("When subagents finish");
    expect(describeWakeUpStatus(summary(), NOW)).toEqual({ text: "Next run in 12m", tone: "active" });
    expect(
      describeWakeUpStatus(
        summary({
          state: "paused",
          reason: "A run is running on this task. This schedule resumes when the run ends.",
        }),
        NOW,
      ).text,
    ).toBe("Paused · A run is running on this task. This schedule resumes when the run ends.");
    expect(describeWakeUpStatus(summary({ triggerKind: "completion", nextRunAt: null }), NOW).text).toBe(
      "Waiting for subagents to finish",
    );
    expect(describeWakeUpHistory(summary())).toBe("Checked 3 times · 1 skipped");
    expect(describeWakeUpHistory(summary({ occurrenceCount: 0, skippedCount: 0 }))).toBeNull();
  });

  test("the section lists the task's wake-up with the controls its state allows", () => {
    const render = (entrySummary: WakeUpSummary) =>
      renderToStaticMarkup(
        createElement(WakeUpSectionView, {
          entry: { wakeUp: WAKE_UP, summary: entrySummary },
          now: NOW,
          onSetPaused: () => {},
          onRemove: () => {},
        }),
      );
    const scheduled = render(summary());
    expect(scheduled).toContain("Schedule");
    expect(scheduled).toContain("Every hour");
    expect(scheduled).toContain(">Pause<");
    expect(scheduled).toContain(">Remove<");
    expect(scheduled).not.toContain(">Resume<");

    const paused = render(summary({ state: "paused", reason: "Paused by the user." }));
    expect(paused).toContain(">Resume<");
    expect(paused).toContain("Paused · Paused by the user.");
  });

  test("the store keeps one wake-up per task in the active workspace", () => {
    useWakeUpsStore.setState({
      workspaceId: "ws-1",
      byTask: { [wakeUpTaskKey("ws-1", "task-1")]: { wakeUp: WAKE_UP, summary: summary() } },
    });
    expect(useWakeUpsStore.getState().byTask["ws-1:task-1"]?.wakeUp.id).toBe("wake-1");
  });
});

const REPORT: AgentRunReport = {
  agentRunId: "agent-run-1",
  workflowName: "Request → PR",
  assignment: "Add CSV export.",
  outcome: "completed",
  reason: null,
  startedAt: "2026-09-26T10:00:00.000Z",
  endedAt: "2026-09-26T10:30:00.000Z",
  turnCount: 6,
  stages: [
    {
      stageId: "build",
      title: "Build",
      kind: "ai",
      status: "completed",
      attempts: 1,
      summary: "Built it.",
      decisions: [
        { decision: "Reuse the table model", reason: "It already has the rows." },
        { decision: "x".repeat(200), reason: "y".repeat(200) },
      ],
      evidence: [],
      detail: null,
    },
  ],
  acceptanceCriteria: [],
  links: [{ label: "Opened draft PR #9", url: "https://github.com/acme/app/pull/9", source: "stave" }],
  leftBehind: [],
};

describe("Run report actions", () => {
  test("adding the report to a pull request replaces an earlier copy instead of repeating it", () => {
    const once = mergeReportIntoPullRequestBody("## Summary\nAdds export.", "## Run complete\nv1");
    expect(once).toBe(
      "## Summary\nAdds export.\n\n<!-- stave:mission-report -->\n## Run complete\nv1\n<!-- /stave:mission-report -->\n",
    );
    const twice = mergeReportIntoPullRequestBody(once, "## Run complete\nv2");
    expect(twice).toContain("v2");
    expect(twice).not.toContain("v1");
    expect(twice.split("<!-- stave:mission-report -->")).toHaveLength(2);
    expect(mergeReportIntoPullRequestBody("", "## Report")).toBe(
      "<!-- stave:mission-report -->\n## Report\n<!-- /stave:mission-report -->\n",
    );
  });

  test("decisions become short memory candidates, and the PR action needs a PR", () => {
    const facts = decisionsAsMemoryFacts(REPORT);
    expect(facts[0]).toEqual({ kind: "decision", content: "Reuse the table model — It already has the rows." });
    expect(facts[1]!.content.length).toBeLessThanOrEqual(280);
    expect(reportMentionsPullRequest(REPORT)).toBe(true);
    expect(reportMentionsPullRequest({ ...REPORT, links: [] })).toBe(false);
  });

  test("the report shows only the actions it was given", () => {
    const bare = renderToStaticMarkup(createElement(AgentRunReportView, { report: REPORT }));
    expect(bare).toContain("Copy Markdown");
    expect(bare).not.toContain("Add to PR description");
    const full = renderToStaticMarkup(
      createElement(AgentRunReportView, {
        report: REPORT,
        actions: { addToPullRequest: async () => "ok", saveDecisions: async () => "ok" },
      }),
    );
    expect(full).toContain("Add to PR description");
    // Saving and sharing live in the report's More menu.
    expect(full).toContain('aria-label="More report actions"');
  });
});
