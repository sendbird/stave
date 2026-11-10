import { expect, test } from "bun:test";
import { tarsOwnedQuestion, tarsRecoverableHelper } from "../src/lib/tars/managed-recovery";
import { helperRunDetail } from "./fixtures/tars-helper-runs";
import { tarsResponsibility } from "./fixtures/tars-host-bridge";
import { currentStageRecord } from "../src/lib/agent-runs/domain";
import { tarsActionMode } from "../src/lib/tars/autonomy";

const helper = helperRunDetail({ status: "blocked" });
const stage = currentStageRecord(helper);
const row = tarsResponsibility({ state: "waiting", waitingTaskId: helper.agentRun.leadTaskId,
  observedStage: `${helper.agentRun.id}/${stage.stageId}#${stage.attempt}:${stage.reportRevision}` });

test("recovery is bound to the owned helper's observed report and still waits for explicit sign-off", () => {
  expect(tarsRecoverableHelper(row, [helper])).toBe(helper);
  expect(tarsRecoverableHelper(row, [])).toBeNull();
  expect(tarsRecoverableHelper({ ...row, state: "paused" }, [helper])).toBeNull();
  expect(tarsRecoverableHelper({ ...row, observedStage: "older-report" }, [helper])).toBeNull();
  expect(tarsRecoverableHelper(row, [helperRunDetail({ status: "awaiting-sign-off" })])).toBeNull();
  expect(tarsRecoverableHelper(row, [{ ...helper, stages: helper.stages.map(record => ({ ...record, reportRevision: record.reportRevision + 1 })) }])).toBeNull();
});

test("unreadable questions, approvals, secrets and user-held work never become automatic answers", () => {
  const question = { kind: "question" as const, ref: "q", requestId: "id", messageId: "m", taskId: "child", workspaceId: "ws", toolName: "request_user_input", summary: "Question", questions: [{ key: "k", question: "Use existing tests?", options: [] }] };
  const owner = { ...row, pendingRequests: [question] };
  expect(tarsOwnedQuestion(owner, "q")).toBe(true);
  for (const patch of [{ truncated: true as const }, { questions: [] }, { kind: "approval" as const }, { toolName: "stave_request_secret" }])
    expect(tarsOwnedQuestion({ ...owner, pendingRequests: [{ ...question, ...patch }] }, "q")).toBe(false);
  expect(tarsOwnedQuestion({ ...owner, state: "takenOver" }, "q")).toBe(false);
  expect(tarsOwnedQuestion(owner, "stale")).toBe(false);
  for (const key of ["approve", "signOff", "skipStage"] as const) expect(tarsActionMode(key, "handsOff", "automatic", { ownedQuestion: true })).toBe("confirm");
});

test("the host delivers recovery to the observed helper and rejects an episode or ownership change", async () => {
  const { recoverTarsHelper } = await import("../electron/host-service/tars-helper-recovery");
  let rootHeld = true, changed = false, deliveries = 0;
  const ports = {
    readHelpers: async () => [helper],
    readCurrent: () => ({ ...helper, stages: helper.stages.map(record => changed ? { ...record, reportRevision: record.reportRevision + 1 } : record) }) as never,
    guardRoot: () => { if (!rootHeld) throw new Error("taken over"); },
    reply: async (args: { agentRunId: string; feedback: string }, guard?: (run: typeof helper.agentRun) => void) => {
      guard?.(helper.agentRun);
      expect(args.agentRunId).toBe(helper.agentRun.id);
      expect(args.feedback).toContain("grant no new permissions");
      deliveries++;
    },
  };
  await recoverTarsHelper(row, "Verify with the existing permitted tests.", ports);
  expect(deliveries).toBe(1);
  changed = true;
  await expect(recoverTarsHelper(row, "Retry", ports)).rejects.toThrow("no longer waits");
  changed = false; rootHeld = false;
  await expect(recoverTarsHelper(row, "Retry", ports)).rejects.toThrow("taken over");
  expect(deliveries).toBe(1);
});
