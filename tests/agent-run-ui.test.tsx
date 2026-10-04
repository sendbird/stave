import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { AgentRunResultCardView } from "../src/components/agent-runs/AgentRunResultCard";
import { AgentRunBarView } from "../src/components/agent-runs/AgentRunBar";
import { AgentRunDetailView } from "../src/components/agent-runs/AgentRunPanel";
import { StageDividerView } from "../src/components/agent-runs/StageDivider";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { selectAgentRunCard } from "../src/lib/agent-runs/agent-run-status";
import { AGENT_RUN_NOW, agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";

const START = new Date("2026-10-01T09:00:00.000Z");
const NOW = START.getTime() + 4 * 60_000;
const runs = buildAgentRunFixtures(START);
const noop = (async () => ({ ok: true, agentRun: null })) as never;

const bar = (detail: AgentRunDetail, nowPhrase: string | null = null) =>
  renderToStaticMarkup(
    createElement(AgentRunBarView, {
      detail,
      nowPhrase,
      now: NOW,
      reducedMotion: false,
      agentActions: { onStop: () => {}, onTakeControl: () => {}, onRetry: () => {} },
      actions: { onOpenPanel: () => {} },
    }),
  );
const panel = (detail: AgentRunDetail) =>
  renderToStaticMarkup(
    createElement(AgentRunDetailView, { detail, now: NOW, onCommand: noop, agentActions: { onStop: () => {}, onTakeControl: () => {}, onRetry: () => {}, onAskForChanges: () => {}, onOpenPullRequest: () => {} } }),
  );
const card = (detail: AgentRunDetail, now = NOW) =>
  renderToStaticMarkup(
    createElement(AgentRunResultCardView, {
      detail,
      now,
      actions: { onAskForChanges: () => {}, onOpenPullRequest: () => {}, onRetry: () => {}, onTakeControl: () => {} },
    }),
  );

describe("agent run status line", () => {
  test("says Working and how long, with Stop and Take control, and no stage track", () => {
    const html = bar(runs.working, "Running the tests");
    expect(html).toContain('data-testid="agent-run-bar"');
    expect(html).toContain("Working");
    expect(html).toContain("Planning…");
    expect(html).toContain("4m");
    expect(html).toContain("Stop");
    expect(html).toContain("Take control");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("Stage ");
  });

  test("an agent with a workflow shows its stages and where it stands", () => {
    const html = bar(runs.workflow);
    expect(html).toContain("<ol");
    expect(html).toContain("2/3");
    expect(html).toContain("Cause");
    const detail = panel(runs.workflow);
    expect(detail).toContain('aria-label="Stages"');
    expect(detail).toContain("Reproduce");
    expect(detail).toContain("Check in: Only when stuck");
    expect(panel(runs.working)).not.toContain('aria-label="Stages"');
  });

  test("a blocked run says Needs you and what it waits on", () => {
    const html = bar(runs.needsYou);
    expect(html).toContain("Needs you");
    expect(html).toContain("Which breakpoint should the table switch at");
    expect(html).not.toContain("Retry");
  });

  test("a stuck run's bar owns its reason and Retry while the run is active", () => {
    const html = bar(runs.stuck);
    expect(html).toContain("Needs you");
    expect(html).toContain("The tests have been pending for 20 minutes.");
    expect(html).toContain("Retry");
    expect(html).toContain("Stop");
    expect(html).toContain("Take control");
    expect(bar(runs.working)).not.toContain("Retry");
  });

  test("a legacy run keeps its stage track and Take over", () => {
    const aggregate = agentRunFixture();
    const html = renderToStaticMarkup(
      createElement(AgentRunBarView, {
        detail: agentRunDetail(aggregate),
        nowPhrase: null,
        now: AGENT_RUN_NOW.getTime() + 60_000,
        reducedMotion: false,
        actions: { onTakeOver: () => {} },
      }),
    );
    expect(html).toContain('data-testid="agent-run-bar"');
    expect(html).toContain("<ol");
    expect(html).toContain("Take over");
    expect(html).not.toContain("Take control");
  });
});

describe("agent run result card", () => {
  test("a ready run closes the conversation with its result", () => {
    const html = card(runs.ready);
    expect(html).toContain('data-testid="agent-run-result"');
    expect(html).toContain("Ready");
    expect(html).toContain("Implementer · 23m");
    expect(html).toContain("Checked by Stave");
    expect(html).toContain("Met · agent reported");
    expect(html).toContain("Not verified");
    expect(html).toContain("7 files");
    expect(html).toContain("PR #612");
    expect(html).toContain("scroll container");
    expect(html).toContain("Ask for changes");
    expect(html).toContain("Open PR");
  });

  test("Open PR appears only when the run names a pull request", () => {
    const withoutPullRequest: AgentRunDetail = {
      ...runs.ready,
      report: null,
      stages: runs.ready.stages.map((stage) =>
        stage.report?.outcome === "complete" ? { ...stage, report: { ...stage.report, artifacts: [] } } : stage,
      ),
    };
    const html = card(withoutPullRequest);
    expect(html).toContain("Ask for changes");
    expect(html).not.toContain("Open PR");
  });

  test("a failed run gives the reason with Retry and Take control", () => {
    const html = card(runs.failed);
    expect(html).toContain('data-testid="agent-run-reason"');
    expect(html).toContain("Failed");
    expect(html).toContain("The run used all 30 turns before it finished.");
    expect(html).toContain("Retry");
    expect(html).toContain("Take control");
    expect(html).not.toContain("Ask for changes");
  });

  test("an active run leaves no card, stuck included: the bar owns it", () => {
    expect(card(runs.stuck)).toBe("");
    expect(card(runs.working)).toBe("");
    expect(card(runs.needsYou)).toBe("");
    expect(card(runs.stopped)).toBe("");
  });

  test("a message that started after the run ended makes the card history", () => {
    const later = new Date(Date.parse(runs.failed.agentRun.updatedAt) + 60_000).toISOString();
    expect(selectAgentRunCard({ detail: runs.failed })).toBe("reason");
    expect(selectAgentRunCard({ detail: runs.ready, lastMessageStartedAt: runs.ready.agentRun.createdAt })).toBe("result");
    expect(selectAgentRunCard({ detail: runs.failed, lastMessageStartedAt: later })).toBeNull();
    expect(selectAgentRunCard({ detail: agentRunDetail(agentRunFixture()) })).toBeNull();
  });
});

describe("agent run in the Progress tab", () => {
  test("shows the agent and state, Done when and the result, without workflow controls", () => {
    const html = panel(runs.ready);
    expect(html).toContain('data-testid="agent-run-panel"');
    expect(html).toContain("Implementer");
    expect(html).toContain("Ready");
    expect(html).toContain("Done when");
    expect(html).toContain("Checked by Stave");
    expect(html).toContain("Run report");
    expect(html).toContain("Run figures");
    expect(html).toContain("Ask for changes");
    expect(html).not.toContain("Stages");
    expect(html).not.toContain("Save as workflow");
    expect(html).not.toContain("Stop run");
    expect(html).not.toContain("Pause");
  });

  test("keeps the state and the reason, and leaves Stop, Take control and Retry to the bar and the card", () => {
    const working = panel(runs.working);
    expect(working).toContain("Working");
    const stuck = panel(runs.stuck);
    expect(stuck).toContain("Needs you");
    expect(stuck).toContain("The tests have been pending for 20 minutes.");
    const failed = panel(runs.failed);
    expect(failed).toContain("Failed");
    expect(failed).toContain("The run used all 30 turns before it finished.");
    for (const html of [working, stuck, failed]) {
      expect(html).not.toContain(">Stop<");
      expect(html).not.toContain("Take control");
      expect(html).not.toContain("Retry");
    }
  });

  test("a one-stage run lists the agent's plan as its steps", () => {
    const plan = {
      turnId: "turn-2",
      items: [
        { content: "Reproduce on a narrow screen", status: "completed" as const },
        { content: "Fix the table", status: "in_progress" as const },
      ],
    };
    const detail: AgentRunDetail = {
      ...runs.working,
      stages: runs.working.stages.map((record) => ({ ...record, facts: { diff: null, commands: [], toolCalls: [], action: null, plan } })),
    };
    const html = panel(detail);
    expect(html).toContain('aria-label="Plan"');
    expect(html).toContain("1 of 2 done");
    expect(html).toContain("Reproduce on a narrow screen");
    expect(html).toContain("Fix the table");
    // No plan written yet: no empty section.
    expect(panel(runs.working)).not.toContain('aria-label="Plan"');
  });

  test("a run with a workflow names it and lets you retry or skip a stuck stage", () => {
    const titles = runs.workflow.agentRun.workflow.stages.map((stage) => stage.title).join(" → ");
    const running = panel(runs.workflow);
    expect(running).toContain(`Workflow: ${titles}`);
    expect(running).toContain("Stages");
    expect(running).not.toContain("Retry stage");
    const stuck: AgentRunDetail = {
      ...runs.workflow,
      stages: runs.workflow.stages.map((record) =>
        record.stageId === "cause" ? { ...record, status: "stuck", detail: "No progress for 20 minutes." } : record,
      ),
    };
    const html = panel(stuck);
    expect(html).toContain("Retry stage");
    expect(html).toContain("Skip");
  });

  test("a legacy run keeps its stage list", () => {
    const html = renderToStaticMarkup(
      createElement(AgentRunDetailView, { detail: agentRunDetail(agentRunFixture()), now: AGENT_RUN_NOW.getTime() + 60_000, onCommand: noop }),
    );
    expect(html).toContain('data-testid="agent-run-panel"');
    expect(html).toContain("Stages");
    expect(html).toContain("Run ·");
  });
});

describe("stage divider", () => {
  test("a workflow stage keeps its divider", () => {
    expect(renderToStaticMarkup(createElement(StageDividerView, { text: "Stage 3 · Verify — started automatically" }))).toContain(
      'data-testid="agent-run-stage-divider"',
    );
  });
});
