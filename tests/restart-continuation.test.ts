import { normalizeUsageLimitPauses } from "../src/store/task-work-pause";
import { describe, expect, test } from "bun:test";
import { buildRestartContinuationPrompt, canRecoverOrdinaryTask, emptyRestartRecovery, RestartRecoverySchema, restartContinuationDecision } from "../src/store/restart-continuation";
import type { ChatMessage, Task } from "../src/types/chat";
const task = { id: "t", title: "task", provider: "codex", controlMode: "interactive", controlOwner: "stave" } as Task;
describe("restart continuation", () => {
  test("each policy and three continuations in five minutes", () => {
    expect(restartContinuationDecision("ask", [], 1000)).toBe("ask");
    expect(restartContinuationDecision("never", [], 1000)).toBe("ignore");
    expect(restartContinuationDecision("automatically", [1, 2], 1000)).toBe("continue");
    expect(restartContinuationDecision("automatically", [1, 2, 3], 1000)).toBe("ask");
    expect(restartContinuationDecision("automatically", [1, 2, 3], 301000)).toBe("continue");
  });
  test("restart serializes automatic guard, consumed and user-stopped turns", () => {
    const saved = { ...emptyRestartRecovery(), consumedTurnIds: ["done"], stoppedTurnIds: ["stopped"], automaticTimesByTask: { t: [10, 20, 30] } };
    expect(RestartRecoverySchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(RestartRecoverySchema.safeParse({ ...saved, surprise: true }).success).toBe(false);
  });
  for (const provider of ["claude-code", "codex"] as const) {
    test(`${provider} ordinary tasks continue and ownership and input exclude`, () => {
      const base = { task: { ...task, provider }, messages: [], stopped: false, owned: false };
      expect(canRecoverOrdinaryTask(base)).toBe(true);
      expect(canRecoverOrdinaryTask({ ...base, stopped: true })).toBe(false);
      expect(canRecoverOrdinaryTask({ ...base, owned: true })).toBe(false);
      expect(canRecoverOrdinaryTask({ ...base, task: { ...task, controlMode: "managed" } })).toBe(false);
      expect(canRecoverOrdinaryTask({ ...base, task: { ...task, parentTaskId: "parent" } })).toBe(false);
      for (const part of [{ type: "approval", state: "approval-requested" }, { type: "user_input", state: "input-requested" }, { type: "user_input", state: "input-interrupted" }]) {
        expect(canRecoverOrdinaryTask({ ...base, messages: [{ parts: [part] }] as ChatMessage[] })).toBe(false);
      }
    });
  }
  test("continuation asks to inspect uncertain command results", () => {
    expect(buildRestartContinuationPrompt()).toContain("may or may not have finished");
    expect(buildRestartContinuationPrompt()).toContain("Check the current state before repeating");
  });
});

test("saved untrusted pause extras and invalid timestamps cannot arm a timer", () => {
  expect(normalizeUsageLimitPauses({ t: { workspaceId: "w", providerId: "codex", stoppedTurn: true, pausedAt: 1, resetsAt: 2, autoResumeAt: 3, extra: true } })).toEqual({});
  expect(normalizeUsageLimitPauses({ t: { workspaceId: "w", providerId: "codex", stoppedTurn: true, pausedAt: 1, resetsAt: 2, autoResumeAt: Infinity } })).toEqual({});
});
