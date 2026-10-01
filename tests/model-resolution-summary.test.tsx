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
