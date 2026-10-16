import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTurnProvenance } from "@/lib/agents/turn-provenance";
import {
  formatActualRunModel,
  ModelResolutionSummary,
} from "@/components/session/ModelResolutionSummary";

test("run details name the sealed Agent and distinguish configured delivery from completion", () => {
  const provenance: AgentTurnProvenance = {
    version: 1, turnId: "turn", assignmentId: "assignment", agentConfigId: "agent", agentName: "Saved Agent",
    agentContentHash: "abcdef1234567890", role: "primary", providerId: "codex", model: "requested", effort: "low",
    permission: { source: "agent-ceiling", agentLimit: "read-only", support: "enforced",
      applied: { codexFileAccess: "read-only", codexApprovalPolicy: "on-request" } },
    instructions: { channel: "instruction", status: "configured" },
  };
  const html = renderToStaticMarkup(createElement(ModelResolutionSummary, { actual: null, agentProvenance: provenance }));
  expect(html).toContain("Saved Agent");
  expect(html).toContain("abcdef123456");
  expect(html).toContain("Configured; delivery not confirmed");
  expect(html).toContain("Agent ceiling · read-only");
  expect(html).toContain("Files: read-only");
  expect(html).not.toContain("Delivered");
  const historical = renderToStaticMarkup(createElement(ModelResolutionSummary, { actual: null }));
  expect(historical).not.toContain("Assigned main Agent");
  for (const [source, label] of [
    ["user-settings", "User settings"],
    ["delegation-policy", "Delegation policy"],
  ] as const) {
    const sourced = renderToStaticMarkup(createElement(ModelResolutionSummary, {
      actual: null,
      agentProvenance: {
        ...provenance,
        permission: { ...provenance.permission, source, agentLimit: "auto" },
      },
    }));
    expect(sourced).toContain(`${label}</dd>`);
    expect(sourced).not.toContain(`${label} · auto`);
    expect(sourced).toContain("Files: read-only · Approval: on-request");
  }
});

test("run model label carries the dispatched effort next to the model", () => {
  expect(
    formatActualRunModel({
      providerId: "claude-code",
      model: "claude-fable-5-1",
      modelInfo: { effort: "high" },
    }),
  ).toBe("Claude Fable 5.1 · High");
  expect(
    formatActualRunModel({
      providerId: "codex",
      model: "gpt-5.6-terra",
      modelInfo: { effort: "xhigh", fastMode: true },
    }),
  ).toContain("· X-High · Fast");
  // Records without effort stay as they were; unknown providers print raw.
  expect(
    formatActualRunModel({ providerId: "codex", model: "gpt-5.6-terra" }),
  ).not.toContain("·  ");
  expect(formatActualRunModel({ providerId: "other", model: "m-1" })).toBe(
    "other · m-1",
  );
});

test("summary renders the effort in the Run model row", () => {
  const html = renderToStaticMarkup(
    createElement(ModelResolutionSummary, {
      actual: {
        providerId: "claude-code",
        model: "claude-fable-5-1",
        modelInfo: { effort: "max" },
      },
    }),
  );
  expect(html).toContain("Run model");
  expect(html).toContain("Claude Fable 5.1 · Max");
  expect(html).not.toContain("Claude Code · Claude");
});

test("routing-only summary omits model facts already shown by its header", () => {
  const html = renderToStaticMarkup(
    createElement(ModelResolutionSummary, {
      actual: {
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
      },
      showModelFacts: false,
    }),
  );

  expect(html).not.toContain("Run model");
  expect(html).not.toContain("Routed target");
  expect(html).not.toContain("X-High");
  expect(html).not.toContain("Fast");
  expect(html).toContain("A bounded implementation task");
});

test("routing-only summary preserves a target that differs from the actual run", () => {
  const html = renderToStaticMarkup(
    createElement(ModelResolutionSummary, {
      actual: {
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
      showModelFacts: false,
    }),
  );

  expect(html).not.toContain("Run model");
  expect(html).not.toContain("GPT-5.6 Terra");
  expect(html).toContain("Routed target");
  expect(html).toContain("Claude Opus 5");
});

test("routing-only summary omits a routed target already shown when no runtime model exists", () => {
  const html = renderToStaticMarkup(
    createElement(ModelResolutionSummary, {
      actual: null,
      resolution: {
        selectedProviderId: "codex",
        selectedModel: "gpt-5.6-terra",
        source: "heuristic",
        rationale: "A bounded implementation task",
        confidence: 0.8,
        taskType: "implementation",
      },
      showModelFacts: false,
    }),
  );

  expect(html).not.toContain("Routed target");
  expect(html).not.toContain("GPT-5.6 Terra");
  expect(html).toContain("A bounded implementation task");
});

test("Why lists the decision model facts the turn recorded and nothing it did not", () => {
  const resolution = {
    selectedProviderId: "codex" as const,
    selectedModel: "gpt-5.4",
    source: "classifier_fallback" as const,
    rationale: "Fell back to the native classifier.",
    confidence: null,
    taskType: "implementation" as const,
    routingDecision: {
      providerId: "codex" as const,
      model: "gpt-5.4-mini",
      preferred: { mode: "gateway" as const, connectionId: "6f1d1c8e-8a4b-4c6f-9a55-0c0f0b7d6a10", model: "openai/gpt-5.4-mini" },
      fallback: true,
      elapsedMs: 640,
      failure: "rate-limit" as const,
      reportedCostUsd: null,
    },
  };
  const html = renderToStaticMarkup(createElement(ModelResolutionSummary, { actual: null, resolution, showModelFacts: false }));
  expect(html).toContain("Decision model");
  expect(html).toContain("GPT-5.4 Mini");
  expect(html).toContain("640ms");
  expect(html).toContain('data-decision-fact="failure"');
  expect(html).toContain("rate limit");
  // No Gateway-reported cost was recorded, so no "unknown" row is drawn.
  expect(html).not.toContain('data-decision-fact="cost"');

  const local = renderToStaticMarkup(createElement(ModelResolutionSummary, {
    actual: null,
    resolution: { ...resolution, routingDecision: { ...resolution.routingDecision, providerId: "local" as const, model: null, preferred: { mode: "automatic" as const }, failure: "unavailable" as const } },
  }));
  expect(local).not.toContain('data-decision-fact="model"');
  expect(local).not.toContain('data-decision-fact="failure"');
  expect(local).toContain('data-decision-fact="elapsed"');

  const unrecorded = renderToStaticMarkup(createElement(ModelResolutionSummary, { actual: null, resolution: { ...resolution, routingDecision: undefined } }));
  expect(unrecorded).not.toContain("data-decision-fact");
});
