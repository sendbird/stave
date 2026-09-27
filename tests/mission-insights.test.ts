import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregateMissionInsights, formatCompletionRate, type MissionInsightSample } from "../src/lib/missions/insights";

function sample(patch: Partial<MissionInsightSample> & { replies?: number; nudges?: number; stuck?: number; waitMs?: number | null; cost?: number | null }): MissionInsightSample {
  const waitMs = patch.waitMs === undefined ? 60_000 : patch.waitMs;
  return {
    playbookName: patch.playbookName ?? "Request → PR",
    providerId: patch.providerId ?? "claude-code",
    state: patch.state ?? "completed",
    metrics: {
      providerId: patch.providerId ?? "claude-code",
      userReplies: patch.replies ?? 0,
      nudges: patch.nudges ?? 0,
      stuckStages: patch.stuck ?? 0,
      signOffs: waitMs === null ? 0 : 1,
      signOffWaitAverageMs: waitMs,
      signOffWaitLongestMs: waitMs,
    },
    usage: patch.cost === undefined || patch.cost === null ? null : { turns: 3, measuredTurns: 3, inputTokens: 1, outputTokens: 1, costUsd: patch.cost },
  };
}

test("insights group by playbook and provider, averaging per mission and weighting sign-off waits by count", () => {
  const insights = aggregateMissionInsights(
    [
      sample({ replies: 2, nudges: 1, cost: 1 }),
      sample({ replies: 0, state: "stopped", waitMs: 180_000, cost: 3 }),
      sample({ providerId: "codex", stuck: 1, waitMs: null }),
      sample({ playbookName: "Fix failing checks", providerId: "codex" }),
    ],
    30,
  );
  expect(insights.days).toBe(30);
  const claude = insights.rows.find((row) => row.providerId === "claude-code")!;
  expect(claude).toMatchObject({ missions: 2, completed: 1, repliesPerMission: 1, remindersPerMission: 0.5, signOffWaitAverageMs: 120_000, costPerMission: 2 });
  expect(formatCompletionRate(claude)).toBe("50%");
  const codex = insights.providers.find((row) => row.providerId === "codex")!;
  expect(codex).toMatchObject({ missions: 2, stuckPerMission: 0.5, costPerMission: null, signOffWaitAverageMs: 60_000 });
  // Most missions first.
  expect(insights.rows[0]!.missions).toBe(2);
});

test("the insights view explains itself and shows each provider", async () => {
  const { MissionInsightsView } = await import("../src/components/playbooks/MissionInsights");
  const html = renderToStaticMarkup(createElement(MissionInsightsView, { load: async () => null }));
  expect(html).toContain("Mission insights");
  expect(html).toContain("Reading missions");
});
