import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describeRunModel, AgentRunSummary, type AgentRunSummaryProps } from "../src/components/agent-runs/AgentRunSummary";

const START = "2026-09-27T09:46:00.000Z";
const now = Date.parse(START) + 4 * 60_000;

function render(patch: Partial<AgentRunSummaryProps["agentRun"]> = {}, rest: Partial<AgentRunSummaryProps> = {}) {
  return renderToStaticMarkup(
    createElement(AgentRunSummary, {
      agentRun: {
        fingerprint: { providerId: "claude-code", model: "claude-opus-5-5[1m]" },
        consent: { checkIns: "plan-and-publishing", permissionMode: "auto", authorizedEffectStageIds: [] },
        turnCount: 2,
        maxTurns: 30,
        createdAt: START,
        updatedAt: START,
        ...patch,
      } as AgentRunSummaryProps["agentRun"],
      usage: { turns: 2, measuredTurns: 1, inputTokens: 3_000, outputTokens: 700, costUsd: 309.96 },
      active: true,
      now,
      formatClock: () => "6:46 PM",
      ...rest,
    }),
  );
}

test("the run reads as who runs it, then its figures", () => {
  const html = render();
  expect(html).toContain("Claude Opus 5.5 (1M)");
  expect(html).toContain("Auto permissions");
  expect(html).toContain(">2<");
  expect(html).toContain("/ 30");
  expect(html).toContain("$309.96");
  expect(html).toContain("3.7k tokens");
  expect(html).toContain("Running for");
  expect(html).toContain("4m");
  expect(html).toContain("since 6:46 PM");
  expect(html).toContain("1 turn reported no usage, so the total may be low.");
});

test("a run on the user's own settings says so instead of Manual", () => {
  const html = render({
    consent: { checkIns: "plan-and-publishing", permissionMode: "manual", authorizedEffectStageIds: [] },
  });
  expect(html).toContain("Your permission settings");
  expect(html).not.toContain("Manual");
});

test("a provider that reports tokens only shows tokens, and a near budget explains the halt", () => {
  const html = render(
    { fingerprint: { providerId: "codex", model: "gpt-6-sol" } as never, turnCount: 25 },
    { usage: { turns: 25, measuredTurns: 25, inputTokens: 160_000, outputTokens: 9_400, costUsd: null } },
  );
  expect(html).toContain("GPT-6 Sol");
  expect(html).toContain("Codex");
  expect(html).toContain("Tokens");
  expect(html).toContain("No cost reported");
  expect(html).toContain("Close to its 30-turn budget; the run halts there until you extend it.");
});

test("an ended run counts its time to its end, and aliases name their provider", () => {
  const html = render({ updatedAt: new Date(Date.parse(START) + 34 * 60_000).toISOString() }, { active: false, usage: null });
  expect(html).toContain("Ran for");
  expect(html).toContain("34m");
  expect(html).toContain("Not reported yet");
  expect(describeRunModel("claude-code", "sonnet")).toEqual({ name: "Claude Sonnet", namesProvider: true });
  expect(describeRunModel("codex", "gpt-6-sol")).toEqual({ name: "GPT-6 Sol", namesProvider: false });
});

test("with the host's active time the run reads Active for, its pauses left out", () => {
  // Paused for 30 of 40 minutes: the clock stands at the 10 it worked.
  const html = render({}, {
    now: Date.parse(START) + 40 * 60_000,
    activeTime: { activeMs: 10 * 60_000, activeSince: null },
  });
  expect(html).toContain("Active for");
  expect(html).not.toContain("Running for");
  expect(html).toContain(">10m<");
  expect(html).toContain("since 6:46 PM · pauses not counted");
  // The wall-clock span stays on hover.
  expect(html).toContain("It started 40m ago.");
});

test("a counting active span adds the time since it began, and an ended run reads its active time", () => {
  const counting = render({}, {
    now: Date.parse(START) + 25 * 60_000,
    activeTime: { activeMs: 5 * 60_000, activeSince: new Date(Date.parse(START) + 20 * 60_000).toISOString() },
  });
  expect(counting).toContain(">10m<");
  const ended = render({ updatedAt: new Date(Date.parse(START) + 34 * 60_000).toISOString() }, {
    active: false,
    activeTime: { activeMs: 21 * 60_000, activeSince: null },
  });
  expect(ended).toContain("Active time");
  expect(ended).toContain(">21m<");
  expect(ended).toContain("from 6:46 PM · pauses not counted");
  expect(ended).toContain("It took 34m from start to end.");
});
