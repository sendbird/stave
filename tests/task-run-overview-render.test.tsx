import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskRunOverviewView } from "@/components/session/TaskRunOverview";

const CLAUDE_RUN = {
  providerId: "claude-code",
  model: "claude-opus-5",
} as const;

describe("TaskRunOverviewView", () => {
  test("keeps the run summary fixed instead of making the header a disclosure", () => {
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
    expect(html).not.toContain("<summary");
  });

  test("keeps automatic routing rationale separate without repeating the model configuration", () => {
    const html = renderToStaticMarkup(
      createElement(TaskRunOverviewView, {
        title: "Current run",
        status: { label: "Running", tone: "active" },
        actualModel: {
          providerId: "codex",
          model: "gpt-5.6-terra",
          modelInfo: { effort: "xhigh", fastMode: true },
        },
        resolution: {
          selectedProviderId: "codex",
          selectedModel: "gpt-5.6-terra",
          source: "heuristic",
          rationale: "A bounded implementation task",
          confidence: 0.8,
          taskType: "implementation",
          taskClass: "implement",
          stance: "balanced",
          ruleReason: "Implementation uses the selected coding model",
        },
        runTurnId: "turn-1",
      }),
    );

    expect(html).toMatch(
      /<div[^>]*>[\s\S]*Current run[\s\S]*GPT-5.6 Terra · X-High · Fast[\s\S]*<\/div>/,
    );
    expect(html).toContain("Routing details");
    expect(html).toContain("A bounded implementation task");
    expect(html).not.toContain("Run model");
    expect(html).not.toContain("Routed target");
  });

  test("keeps a routed target when the runtime reports a different model", () => {
    const html = renderToStaticMarkup(
      createElement(TaskRunOverviewView, {
        title: "Last run",
        status: { label: "Completed", tone: "success" },
        actualModel: {
          providerId: "codex",
          model: "gpt-5.6-terra",
          modelInfo: { effort: "high" },
        },
        resolution: {
          selectedProviderId: "claude-code",
          selectedModel: "claude-opus-5",
          source: "classifier",
          rationale: "The task was initially routed for deeper analysis",
          confidence: 0.86,
          taskType: "review",
        },
        runTurnId: "turn-1",
      }),
    );

    expect(html).toContain("GPT-5.6 Terra · High");
    expect(html).toContain("Routed target");
    expect(html).toContain("Claude Opus 5");
    expect(html).not.toContain("Run model");
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


test("keeps manual model changes in a closed disclosure without adding confirmation controls", () => {
  const html = renderToStaticMarkup(createElement(TaskRunOverviewView, {
    title: "Last run", status: { label: "Completed", tone: "success" }, runTurnId: "turn-1",
    actualModel: { providerId: "codex", model: "gpt-6-luna", modelExecution: {
      requestedModel: "gpt-6-sol", actualModel: "gpt-6-luna", reason: "The runtime selected a different model.",
    } },
  }));
  expect(html).toContain("Model details");
  expect(html).toContain("Requested model");
  expect(html).toContain("GPT-6 Sol");
  expect(html).toContain("GPT-6 Luna");
  expect(html).toContain("The runtime selected a different model.");
  expect(html).not.toMatch(/<details[^>]*open/);
  expect(html).not.toContain("<button");
});
