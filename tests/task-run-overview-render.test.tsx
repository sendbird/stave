import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskRunOverviewView } from "@/components/session/TaskRunOverview";

const CLAUDE_RUN = {
  providerId: "claude-code",
  model: "claude-opus-5",
} as const;

describe("TaskRunOverviewView", () => {
  test("puts the run model on the title line instead of a Running badge", () => {
    const html = renderToStaticMarkup(
      createElement(TaskRunOverviewView, {
        title: "Current run",
        status: { label: "Running", tone: "active" },
        actualModel: { ...CLAUDE_RUN },
        runTurnId: "turn-1",
      }),
    );

    expect(html).toContain("Current run");
    // The activity headline underneath already says the turn is running.
    expect(html).not.toContain("Running");
    expect(html).toContain("claude-color.svg");
    expect(html).toContain("Claude Opus 5");
    // One line: the model rides inside the summary that discloses the
    // resolution rather than sitting on rows of its own beneath it.
    expect(html).toMatch(
      /<summary[^>]*>[\s\S]*Current run[\s\S]*Claude Opus 5[\s\S]*<\/summary>/,
    );
    expect(html).not.toContain("Model details");
  });

  test("keeps a resting status beside the title once the run ends", () => {
    const html = renderToStaticMarkup(
      createElement(TaskRunOverviewView, {
        title: "Last run",
        status: { label: "Failed", tone: "danger" },
        actualModel: { ...CLAUDE_RUN },
        runTurnId: "turn-1",
      }),
    );

    expect(html).toContain("Last run");
    expect(html).toContain("Failed");
    expect(html).toContain("Claude Opus 5");
  });

  test("renders the header without a disclosure when no model was reported", () => {
    const html = renderToStaticMarkup(
      createElement(TaskRunOverviewView, {
        title: "Run overview",
        status: { label: "No run yet", tone: "neutral" },
        actualModel: null,
      }),
    );

    expect(html).toContain("Run overview");
    expect(html).not.toContain("<summary");
  });
});
