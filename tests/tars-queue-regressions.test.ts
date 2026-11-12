import { afterEach, expect, test } from "bun:test";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";
import { tarsAskDecisionId, projectTarsDecisions } from "../src/lib/tars/decisions";
import { readOpenTarsAsks } from "../electron/persistence/tars-proposals";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const fixture = () => { const f = followUpFixture(); cleanup.push(f.close); return f; };

test("an unrelated user message preserves a resultReady follow-up and a different work's pending question", async () => {
  const f = fixture();
  const created = f.responsibilities.create({ requestId: "pr-goal", title: "Publish the verified work", instruction: "Open a pull request.",
    acceptanceCriteria: ["Checks pass"], completionGoal: "pullRequest", workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, f.now());
  const result = f.responsibilities.patch(created.id, created.revision, { state: "resultReady", agentRunId: "run-result", resultVerifiedRunId: "run-result" }, f.now());
  const blocked = f.responsibility("blocked", { detail: "Tests need a decision.", executionPending: false });
  const message = f.conversations.create({ requestId: "question", text: "", attachments: [
    { type: "file_context", filePath: "context.md", content: "Review this work.", language: "markdown" },
  ] }, f.now());
  const claimed = f.conversations.claim(message.id, message.revision, f.now());
  const ask = { kind: "ask" as const, question: "Retry the blocked work?", options: [
    { label: "Retry", rationale: "Try its current stage again.", effect: { kind: "control" as const, responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "retryStage" as const } },
    { label: "Discuss", rationale: "Explain the blocker first.", effect: { kind: "reply" as const } },
  ] };
  const answered = f.conversations.answer(claimed.id, claimed.revision, { reply: "A choice is needed.", actions: [ask] }, f.now());
  const receipt = f.conversations.recordReceipt(answered.id, answered.revision, 0, ask, f.now());
  f.conversations.settleReceipt(answered.id, 0, receipt.revision, { status: "proposed" }, f.now());
  f.advance(minutes(1));
  f.conversations.create({ requestId: "unrelated", text: "What is a workspace?" }, f.now());
  f.service.start(); await f.settle();
  expect(f.automatic().some((entry) => entry.origin?.kind === "followUp" && entry.origin.responsibilityId === result.id && entry.state === "answered")).toBe(true);
  expect(readOpenTarsAsks(f.database).some((entry) => entry.messageId === answered.id)).toBe(true);
  expect(f.responsibilities.snapshot().pendingDecisions.some((entry) => entry.messageId === answered.id)).toBe(true);
  const conversation = f.service.getConversation();
  const views = projectTarsDecisions({ ...conversation, responsibilities: f.responsibilities.snapshot().responsibilities });
  expect(views.find((entry) => entry.id === tarsAskDecisionId(answered.id, 0))?.state).toBe("waiting");
  const choice = await f.service.answerDecision({ decisionId: tarsAskDecisionId(answered.id, 0), optionIndex: 1, source: "click" });
  expect(choice).toMatchObject({ refusal: null, answer: { status: "applied" } });
  await f.service.whenIdle();
});

test("a limit-reached pause gets one prompt follow-up, with automatic extension guidance, without an hour's delay", async () => {
  const f = fixture();
  const row = f.responsibility("running");
  f.observations.set(row.id, { state: "waiting", detail: "The run used all its turns.", detailCode: "runPaused",
    detailParams: { reason: "limit-reached" }, runTurns: 30, runStage: "work#1" });
  f.service.start(); await f.settle();
  expect(f.planner).toHaveLength(1);
  expect(f.automatic()[0]?.origin).toMatchObject({ kind: "followUp", responsibilityId: row.id, reason: "limitReached" });
  const prompt = f.planner[0]!.input.prompt;
  expect(prompt).toContain("during an eligible automatic follow-up");
  expect(prompt).not.toContain("Propose these only when the current user message asks for them");
  await f.settle();
  f.advance(minutes(61)); await f.settle();
  expect(f.planner).toHaveLength(1);
});
