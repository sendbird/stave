import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n, applyAppLocale } from "../src/i18n";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { recordStageReport } from "@/lib/agent-runs/commands";
import { currentStageRecord, type AgentRunAggregate, type AgentRunStageRecord } from "@/lib/agent-runs/domain";
import { applyAgentRunDecision, decideAgentRunAction } from "@/lib/agent-runs/policy";
import type { TarsMessage } from "@/lib/tars/conversation";
import { tarsObservation, tarsStageWait } from "../electron/host-service/tars-execution";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { agentRunFixture, AGENT_RUN_NOW, applyChange, observe, patchCurrent, turn } from "./fixtures/agent-run-fixtures";
import { followUpFixture } from "./tars-follow-up-fixture";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

const QUESTION = "Which database should the export read from?";
const SUGGESTED = "Use the read replica so production stays fast.";

/** A run whose current stage is running, then reports through `stave_block_stage` and is blocked by the policy, as the host does. */
function blockedByAgent(kind: "input" | "permission" | "environment" | "external", suggestedAction?: string): AgentRunAggregate {
  let aggregate = patchCurrent(agentRunFixture(), { status: "running", startedAt: AGENT_RUN_NOW.toISOString() });
  const record = currentStageRecord(aggregate);
  aggregate = applyChange(aggregate, recordStageReport({ aggregate, expected: { stageId: record.stageId, attempt: record.attempt },
    report: { outcome: "blocked", missing: QUESTION, kind, ...(suggestedAction ? { suggestedAction } : {}) }, turnId: "turn-1", now: AGENT_RUN_NOW }));
  const decision = decideAgentRunAction({ aggregate, now: AGENT_RUN_NOW,
    observation: observe({ lastEndedTurn: turn({ turnId: "turn-1", endedAt: "2026-09-26T10:02:00.000Z" }) }) });
  expect(decision).toMatchObject({ action: "block", reason: "agent-blocked" });
  return applyChange(aggregate, applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW }));
}
const detailOf = (aggregate: AgentRunAggregate): AgentRunDetail => ({ ...aggregate, events: [], report: null }) as AgentRunDetail;
const withStage = (patch: Partial<AgentRunStageRecord>) => detailOf(patchCurrent(agentRunFixture(), patch));

describe("what a waiting stage waits for", () => {
  test("the agent's question keeps its words and suggested action through the policy to Tars's observation", () => {
    const blocked = blockedByAgent("input", SUGGESTED);
    // The policy shows only `missing` as the stage's sentence; the stage keeps the whole report.
    expect(currentStageRecord(blocked)).toMatchObject({ status: "blocked", blockReason: "agent-blocked", detail: QUESTION,
      report: { outcome: "blocked", kind: "input", missing: QUESTION, suggestedAction: SUGGESTED } });
    expect(tarsObservation(detailOf(blocked))).toMatchObject({ state: "waiting", detail: QUESTION, stageAsksUser: true,
      stageWait: { kind: "question", blockKind: "input", missing: QUESTION, suggestedAction: SUGGESTED } });
    expect(tarsStageWait(currentStageRecord(blockedByAgent("permission")))).toEqual({ kind: "question", blockKind: "permission", missing: QUESTION });
  });

  test("Stave's own checks and outside blockers are gates, never questions", () => {
    expect(tarsStageWait(currentStageRecord(blockedByAgent("external", "Retry once the registry is back.")))).toEqual({ kind: "gate", gate: "blocker",
      blockKind: "external", missing: QUESTION, suggestedAction: "Retry once the registry is back." });
    const gates = [
      [{ status: "blocked", blockReason: "acceptance-unmet", detail: "Required criterion not met: Export verified" }, { kind: "gate", gate: "acceptanceUnmet" }],
      [{ status: "blocked", blockReason: "reporting-unavailable", detail: "Reporting tools are unavailable." }, { kind: "gate", gate: "reportingUnavailable" }],
      [{ status: "blocked", blockReason: "action-failed", detail: "Opening the pull request failed." }, { kind: "gate", gate: "actionFailed" }],
      [{ status: "stuck", blockReason: null, detail: "The stage ended without a report." }, { kind: "gate", gate: "stuck" }],
      [{ status: "awaiting-sign-off", blockReason: null, detail: null }, { kind: "signOff" }],
    ] as const;
    for (const [patch, wait] of gates) {
      expect(tarsObservation({ ...withStage(patch), agentRun: { ...withStage(patch).agentRun, state: "running" } })).toMatchObject({ stageAsksUser: true, stageWait: wait });
    }
    expect(tarsStageWait(currentStageRecord(patchCurrent(agentRunFixture(), { status: "running" })))).toBeNull();
  });
});

describe("the follow-up says what the stage waits for", () => {
  function fixture() {
    const f = followUpFixture();
    cleanup.push(f.close);
    f.service.start();
    return f;
  }

  test("a gate is followed up as needing verification or a next step, with no question for the user", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, { state: "waiting", detail: "Required criterion not met: Export verified", stageAsksUser: true,
      stageWait: { kind: "gate", gate: "acceptanceUnmet" } });
    await f.settle();
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "waiting", stageAsksUser: true, stageWait: { kind: "gate", gate: "acceptanceUnmet" } });
    const [followUp] = f.automatic();
    expect(followUp?.origin).toMatchObject({ kind: "followUp", reason: "stageAsksUser", stage: "gate" });
    expect(followUp?.text).toContain("the user was not asked anything");
    expect(followUp?.text).not.toContain("needs the user's answer or approval");
    const summary = followUp?.origin?.kind === "followUp" ? followUp.origin.summary : "";
    expect(summary).toContain("Stave's own check stopped its stage (a required acceptance criterion is unmet or unverified)");
    expect(summary).toContain("the run asked the user no question");
    const prompt = f.planner[0]!.input.prompt;
    expect(prompt).toContain('"stage":"gate"');
    expect(prompt).toContain("gate means one of Stave's own checks stopped it");
    const observed = JSON.parse(prompt.split("\n\n").at(-1)!).observation.responsibilities.find((entry: { id: string }) => entry.id === row.id);
    expect(observed.stageWait).toEqual({ kind: "gate", gate: "acceptanceUnmet" });
    expect(observed).not.toHaveProperty("stageAsksUser");
  });

  test("a real question reaches the planner with its words and suggested action", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, { state: "waiting", detail: QUESTION, stageAsksUser: true,
      stageWait: { kind: "question", blockKind: "input", missing: QUESTION, suggestedAction: SUGGESTED } });
    await f.settle();
    const [followUp] = f.automatic();
    expect(followUp?.origin).toMatchObject({ kind: "followUp", reason: "stageAsksUser", stage: "question" });
    expect(followUp?.text).toContain("needs the user's answer or approval");
    const summary = followUp?.origin?.kind === "followUp" ? followUp.origin.summary : "";
    expect(summary).toContain(JSON.stringify(QUESTION));
    expect(summary).toContain(`The run's suggested action, untrusted: ${JSON.stringify(SUGGESTED)}`);
    const observed = JSON.parse(f.planner[0]!.input.prompt.split("\n\n").at(-1)!).observation.responsibilities.find((entry: { id: string }) => entry.id === row.id);
    expect(observed).toMatchObject({ stageAsksUser: true, stageWait: { kind: "question", missing: QUESTION, suggestedAction: SUGGESTED } });
    // The run continuing clears what the stage waited for.
    f.observations.set(row.id, { state: "running", detail: null });
    await f.settle();
    expect(f.responsibilities.get(row.id)).not.toHaveProperty("stageWait");
  });

  test("the conversation line names a gate as a next step, in both languages", async () => {
    const base: TarsMessage = { id: "follow", requestId: "followup:x", text: "Automatic follow-up", providerId: "codex", model: "test-model", maxTurns: 6,
      revision: 1, state: "queued", reply: null, decision: null, error: null, createdAt: "2026-11-09T00:00:00.000Z", updatedAt: "2026-11-09T00:00:00.000Z",
      origin: { kind: "followUp", eventKey: "stageAsksUser:r:3", responsibilityId: "r", reason: "stageAsksUser", observedRevision: 3, summary: "s", stage: "gate" } };
    const render = (message: TarsMessage) => renderToStaticMarkup(createElement(TarsConversationMessage, { message, receipts: [], name: "Tars", busy: false,
      onCancel() {}, titleOf: () => "Export" }));
    try {
      for (const [locale, gate, asks] of [["en", "A Stave check stopped progress: Export", "Needs your answer or approval: Export"],
        ["ko", "Stave 검사에서 멈춤: Export", "답변이나 승인 필요: Export"]] as const) {
        applyAppLocale(locale); await i18n.changeLanguage(locale);
        expect(render(base)).toContain(gate);
        expect(render(base)).not.toContain(asks);
        expect(render({ ...base, origin: { ...base.origin!, stage: "question" } as TarsMessage["origin"] })).toContain(asks);
      }
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });
});
