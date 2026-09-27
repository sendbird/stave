import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describeRunModel, MissionRunSummary, type MissionRunSummaryProps } from "../src/components/missions/MissionRunSummary";

const START = "2026-09-27T09:46:00.000Z";
const now = Date.parse(START) + 4 * 60_000;

function render(patch: Partial<MissionRunSummaryProps["mission"]> = {}, rest: Partial<MissionRunSummaryProps> = {}) {
  return renderToStaticMarkup(
    createElement(MissionRunSummary, {
      mission: {
        fingerprint: { providerId: "claude-code", model: "claude-opus-5-5[1m]" },
        consent: { checkIns: "plan-and-publishing", permissionMode: "auto", authorizedEffectStageIds: [] },
        turnCount: 2,
        maxTurns: 30,
        createdAt: START,
        updatedAt: START,
        ...patch,
      } as MissionRunSummaryProps["mission"],
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

test("a provider that reports tokens only shows tokens, and a near budget says where it stops", () => {
  const html = render(
    { fingerprint: { providerId: "codex", model: "gpt-6-sol" } as never, turnCount: 25 },
    { usage: { turns: 25, measuredTurns: 25, inputTokens: 160_000, outputTokens: 9_400, costUsd: null } },
  );
  expect(html).toContain("GPT-6 Sol");
  expect(html).toContain("Codex");
  expect(html).toContain("Tokens");
  expect(html).toContain("No cost reported");
  expect(html).toContain("Close to its 30-turn budget; the mission stops there.");
});

test("an ended mission counts its time to its end, and aliases name their provider", () => {
  const html = render({ updatedAt: new Date(Date.parse(START) + 34 * 60_000).toISOString() }, { active: false, usage: null });
  expect(html).toContain("Ran for");
  expect(html).toContain("34m");
  expect(html).toContain("Not reported yet");
  expect(describeRunModel("claude-code", "sonnet")).toEqual({ name: "Claude Sonnet", namesProvider: true });
  expect(describeRunModel("codex", "gpt-6-sol")).toEqual({ name: "GPT-6 Sol", namesProvider: false });
});
