import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTable, Figures, OutcomeStrip, Reasons, outcomeTone } from "../src/components/results/ResultsParts";
import { ResultsFailure, beginResultsLoad } from "../src/components/results/ResultsView";
import { aggregateMissionInsights, type ResultSample } from "../src/lib/missions/insights";
import { createAppSurfaceActions, RESULTS_APP_SURFACE, WORKSPACE_APP_SURFACE, normalizeAppActiveSurface, type AppActiveSurface } from "../src/store/app-surface";
import { getCommandPaletteCoreCommands } from "../src/components/layout/command-palette-registry";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
function sample(id: string, patch: Partial<ResultSample> = {}): ResultSample {
  return {
    missionId: id,
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

const insights = aggregateMissionInsights(
  [sample("a"), sample("b"), sample("c", { state: "stopped", stopReason: "turn-cap-reached" }), sample("d", { state: "cancelled", usage: null })],
  30,
);

describe("results page", () => {
  test("the strip shows each outcome with its shape and the ready share", () => {
    const html = renderToStaticMarkup(createElement(OutcomeStrip, { summary: insights.summary, days: 30 }));
    expect(html).toContain("2 / 4");
    expect(html).toContain("ready / ended");
    expect(html).toContain("n = 4");
    expect(html).toContain("ended runs · 30 d");
    for (const word of ["Ready", "Rework", "Failed", "Stopped"]) expect(html).toContain(word);
    expect(html).toContain("50%");
    // Shapes carry the meaning, not only color.
    expect(html).toContain("lucide-circle-check");
    expect(html).toContain("lucide-circle-x");
    expect(html).toContain("lucide-square");
  });

  test("time and cost per ready result say how many runs reported no cost, and omit activity counts", () => {
    const html = renderToStaticMarkup(createElement(Figures, { summary: insights.summary }));
    expect(html).toContain("Time to ready");
    expect(html).toContain("per ready result");
    expect(html).toContain("1 run not reported");
    expect(html).toContain("Corrections");
    for (const omitted of ["lines", "messages", "streak", "tokens"]) expect(html.toLowerCase()).not.toContain(omitted);
  });

  test("reasons are listed with counts and the section disappears without any", () => {
    expect(renderToStaticMarkup(createElement(Reasons, { summary: insights.summary, days: 30 }))).toContain("Turn cap reached");
    expect(renderToStaticMarkup(createElement(Reasons, { summary: aggregateMissionInsights([sample("a")], 7).summary, days: 7 }))).toBe("");
  });

  test("each agent gets a row with ready rate, median cost, corrections and a described last-10", () => {
    const html = renderToStaticMarkup(createElement(AgentTable, { insights, now: NOW, onOpen: () => {} }));
    expect(html).toContain("Reviewer");
    expect(html).toContain("Median cost");
    expect(html).toContain("50%");
    expect(html).toContain("Last 4: 2 ready, 1 failed, 1 stopped");
    expect(html).toContain('aria-expanded="false"');
  });

  test("a failed read explains why and offers a retry", () => {
    const html = renderToStaticMarkup(createElement(ResultsFailure, { message: "The database is locked.", onRetry: () => {} }));
    expect(html).toContain("Results could not be read");
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

  test("the command palette offers Open Results", () => {
    const entry = getCommandPaletteCoreCommands().find((candidate) => candidate.id === "navigation.results");
    expect(entry?.title).toBe("Open Results");
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
