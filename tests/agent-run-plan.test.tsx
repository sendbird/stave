import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunPlan } from "../src/components/agent-runs/AgentRunPlan";

const items = [
  { content: "Inspect the contract", status: "completed" as const },
  { content: "Implement the fix", status: "in_progress" as const },
  { content: "Open the pull request", status: "pending" as const },
];

test("the step a running run is on turns; an ended or paused run's step keeps a still mark", () => {
  const live = renderToStaticMarkup(createElement(AgentRunPlan, { items, live: true }));
  expect(live).toContain("lucide-loader-circle");
  expect(live).not.toContain("lucide-circle-dot");
  const still = renderToStaticMarkup(createElement(AgentRunPlan, { items }));
  expect(still).not.toContain("lucide-loader-circle");
  expect(still).toContain("lucide-circle-dot");
  // Only the current step's mark changes; the spinning class rides on it alone.
  const spinClass = live.match(/lucide-loader-circle[^"]*"/)?.[0];
  expect(spinClass).toBeTruthy();
  expect(live.split("lucide-loader-circle").length - 1).toBe(1);
});
