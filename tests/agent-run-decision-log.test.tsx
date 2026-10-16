import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { DECISION_LOG_VISIBLE } from "../src/components/agent-runs/AgentRunDecisionLog";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { projectAgentRunDecisionLog } from "../src/lib/agent-runs/decision-log";
import { agentRunEvent, agentRunFixture } from "./fixtures/agent-run-fixtures";

const selection = {
  version: 1, source: "classifier",
  previous: { providerId: "claude-code", model: "claude-sonnet-5" },
  selected: { providerId: "claude-code", model: "claude-opus-5" },
  requestedEffort: "high", effortSource: "auto",
  inputs: { quota: "not-provided", catalog: "not-provided", availability: "not-provided" },
};
const gatewayDecision = {
  providerId: "codex", model: "gpt-5.4-mini",
  preferred: { mode: "gateway", connectionId: "6f1d1c8e-8a4b-4c6f-9a55-0c0f0b7d6a10", model: "openai/gpt-5.4-mini" },
  fallback: true, elapsedMs: 2_400, failure: "budget", reportedCostUsd: null,
};

describe("Agent Run decision log", () => {
  test("collects routes, resource changes, account switches, waits and retries in event order", () => {
    const aggregate = agentRunFixture();
    const events = [
      agentRunEvent("turn-started", { stageId: "understand", attempt: 1, routeSelection: selection, routingDecision: gatewayDecision, rationale: "Planning needs the deeper model." }),
      agentRunEvent("report", { stageId: "understand", attempt: 1 }),
      agentRunEvent("resource-decision", { accepted: true, model: "claude-sonnet-5", effort: "medium", reason: "mechanical-step", rationale: "Only renames remain.", stageId: "understand", attempt: 1 }),
      agentRunEvent("resource-decision", { accepted: false, automatic: true, model: "claude-sonnet-5", effort: "medium", reason: "The model is pinned.", stageId: "understand", attempt: 1 }),
      agentRunEvent("account-switched", { from: "acct-work-0000", fromLabel: "Work", to: "acct-home-0000", toLabel: "Personal" }),
      agentRunEvent("wait-registered", { waitKind: "time" }),
      agentRunEvent("stage-retried", { stageId: "understand", attempt: 2 }),
    ];
    const other = { ...agentRunEvent("stage-retried", { stageId: "understand", attempt: 3 }), agentRunId: "another-run" };
    // Out of order on purpose: the log follows the recorded sequence.
    const entries = projectAgentRunDecisionLog({ agentRun: aggregate.agentRun, events: [...events].reverse().concat(other) });
    expect(entries.map((entry) => entry.kind)).toEqual(["route", "resource", "resource", "account", "wait", "retry"]);
    const [route, changed, declined, account, , retry] = entries;
    expect(route!.text).toContain("Stage 1");
    expect(route!.text).toContain("Claude Opus 5 · High");
    expect(route!.text).toContain("was Claude Sonnet 5");
    expect(route!.detail).toContain("Decision model");
    expect(route!.detail).toContain("Decision failure: budget exhausted");
    expect(route!.note).toBe("Planning needs the deeper model.");
    expect(route!.attention).toBe(true);
    expect(changed!.text).toContain("changed to Claude Sonnet 5 · Medium");
    expect(changed!.detail).toBe("Requested by the agent · a mechanical step");
    expect(changed!.attention).toBe(false);
    expect(declined!.detail).toBe("Chosen by Stave · the model is pinned");
    expect(declined!.attention).toBe(true);
    expect(account!.text).toContain("Work → Personal");
    expect(retry!.text).toContain("retried");
  });

  test("reads a route recorded before route selection was saved, and skips unreadable waits", () => {
    const aggregate = agentRunFixture();
    const entries = projectAgentRunDecisionLog({
      agentRun: aggregate.agentRun,
      events: [
        agentRunEvent("turn-started", { stageId: "understand", attempt: 1, fingerprint: { providerId: "codex", model: "gpt-5.4" } }),
        agentRunEvent("wait-woke", { waitKind: "not-a-wait" }),
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toContain("GPT-5.4");
    expect(entries[0]!.detail).toBeNull();
  });

  test("a one-stage run shows the log in Progress and folds a long one to the latest entries", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    const base = buildAgentRunFixtures(now).working;
    expect(base.agentRun.workflow.stages).toHaveLength(1);
    const stageId = base.agentRun.workflow.stages[0]!.id;
    const turns = Array.from({ length: DECISION_LOG_VISIBLE + 2 }, () =>
      ({ ...agentRunEvent("turn-started", { stageId, attempt: 1, fingerprint: { providerId: "codex", model: "gpt-5.4" } }), agentRunId: base.agentRun.id }));
    const html = renderToStaticMarkup(createElement(AgentRunOverview, { detail: { ...base, events: [...base.events, ...turns] }, now: now.getTime() }));
    expect(html).toContain('data-testid="agent-run-decision-log"');
    // One stage: no stage prefix on the route line.
    expect(html).not.toContain("Stage 1: Turn routed");
    expect(html.match(/data-decision-kind="route"/g)).toHaveLength(DECISION_LOG_VISIBLE);
    expect(html).toContain(`Show all ${DECISION_LOG_VISIBLE + 2}`);
    const quiet = renderToStaticMarkup(createElement(AgentRunOverview, { detail: { ...base, events: [] }, now: now.getTime() }));
    expect(quiet).not.toContain('data-testid="agent-run-decision-log"');
  });
});
