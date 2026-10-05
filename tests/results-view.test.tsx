import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTable, Figures, OutcomeStrip, Reasons, outcomeTone } from "../src/components/results/ResultsParts";
import { ResultsFailure, beginResultsLoad } from "../src/components/results/ResultsView";
import { aggregateAgentRunInsights, type ResultSample } from "../src/lib/agent-runs/insights";
import { createAppSurfaceActions, RESULTS_APP_SURFACE, WORKSPACE_APP_SURFACE, normalizeAppActiveSurface, type AppActiveSurface } from "../src/store/app-surface";
import { getCommandPaletteCoreCommands } from "../src/components/layout/command-palette-registry";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
function sample(id: string, patch: Partial<ResultSample> = {}): ResultSample {
  return {
    agentRunId: id,
    workspaceId: "ws",
    leadTaskId: `t-${id}`,
    name: "Reviewer",
    kind: "agent",
    providerId: "claude-code",
    state: "completed",
    stopReason: null,
    startedAt: new Date(NOW - 3_600_000 - 600_000).toISOString(),
    endedAt: new Date(NOW - 3_600_000).toISOString(),
    counts: { userReplies: 0, changesRequested: 0, nudges: 0, stuckStages: 0, turnFailures: 0 },
    usage: { turns: 2, measuredTurns: 2, inputTokens: 1, outputTokens: 1, costUsd: 0.5 },
    ...patch,
  };
}

const insights = aggregateAgentRunInsights(
  [sample("a"), sample("b"), sample("c", { state: "stopped", stopReason: "turn-cap-reached" }), sample("d", { state: "cancelled", usage: null })],
  30,
);

describe("results page", () => {
  test("the strip shows each outcome with its shape and completion share", () => {
    const html = renderToStaticMarkup(createElement(OutcomeStrip, { summary: insights.summary, days: 30 }));
    expect(html).toContain("2 of 4 ended runs completed");
    expect(html).toContain("Completion rate");
    expect(html).toContain("4 ended runs across all workspaces");
    expect(html).toContain("last 30 days");
    for (const word of ["Completed without change request", "Completed after change request", "Failed", "Cancelled"]) expect(html).toContain(word);
    expect(html).toContain("50%");
    // Shapes carry the meaning, not only color.
    expect(html).toContain("lucide-circle-check");
    expect(html).toContain("lucide-circle-x");
    expect(html).toContain("lucide-square");
  });

  test("time and spend disclose reporting coverage without activity counts", () => {
    const html = renderToStaticMarkup(createElement(Figures, { insights }));
    expect(html).toContain("Median completion time");
    expect(html).toContain("Reported spend");
    expect(html).toContain("Cost reported for 3 of 4 runs.");
    expect(html).toContain("Follow-ups per run");
    for (const omitted of ["lines", "messages", "streak", "tokens"]) expect(html.toLowerCase()).not.toContain(omitted);
  });

  test("reasons are listed with counts and the section disappears without any", () => {
    expect(renderToStaticMarkup(createElement(Reasons, { summary: insights.summary }))).toContain("Turn cap reached");
    expect(renderToStaticMarkup(createElement(Reasons, { summary: aggregateAgentRunInsights([sample("a")], 7).summary }))).toBe("");
  });

  test("each agent gets a row with completion rate, sample size, median reported cost and follow-ups", () => {
    const html = renderToStaticMarkup(createElement(AgentTable, { insights, now: NOW, onOpen: () => {} }));
    expect(html).toContain("Reviewer");
    expect(html).toContain("Median reported cost");
    expect(html).toContain("50%");
    expect(html).toContain("4 runs");
    expect(html).not.toContain("Last 4");
    expect(html).toContain('aria-expanded="false"');
  });

  test("a failed read explains why and offers a retry", () => {
    const html = renderToStaticMarkup(createElement(ResultsFailure, { message: "The database is locked.", onRetry: () => {} }));
    expect(html).toContain("Agent performance could not be read");
    expect(html).toContain("The database is locked.");
    expect(html).toContain("Try again");
  });
});

describe("results entry points", () => {
  test("the surface opens, closes and normalizes", () => {
    let state: { activeAppSurface: AppActiveSurface } = { activeAppSurface: WORKSPACE_APP_SURFACE };
    const actions = createAppSurfaceActions((updater) => {
      state = { ...state, ...updater(state) };
    });
    actions.openResults();
    expect(state.activeAppSurface).toBe(RESULTS_APP_SURFACE);
    actions.closeResults();
    expect(state.activeAppSurface.kind).toBe("workspace");
    expect(normalizeAppActiveSurface({ kind: "results" })).toBe(RESULTS_APP_SURFACE);
  });

  test("the command palette offers Open agent performance", () => {
    const entry = getCommandPaletteCoreCommands().find((candidate) => candidate.id === "navigation.results");
    expect(entry?.title).toBe("Open agent performance");
    expect(entry?.group).toBe("navigation");
  });
});

describe("results reload", () => {
  test("a period switch keeps the figures on the page and marks them as reloading", () => {
    const next = beginResultsLoad({ status: "ready", insights, reloading: false });
    expect(next).toEqual({ status: "ready", insights, reloading: true });
  });

  test("with nothing on the page yet it reads from scratch", () => {
    expect(beginResultsLoad({ status: "loading" })).toEqual({ status: "loading" });
    expect(beginResultsLoad({ status: "failed", message: "locked" })).toEqual({ status: "loading" });
    expect(beginResultsLoad({ status: "unavailable" })).toEqual({ status: "loading" });
  });

  test("each bar segment wears its legend icon's tone", () => {
    expect(outcomeTone("ready")).toBe("success");
    expect(outcomeTone("rework")).toBe("warning");
    expect(outcomeTone("failed")).toBe("danger");
    expect(outcomeTone("stopped")).toBe("neutral");
  });
});
