import { describe, expect, test } from "bun:test";
import {
  resolveTaskUserState,
  resolveTurnEnding,
  taskUserStateToWorkState,
  TASK_USER_STATE_LABELS,
  TASK_USER_STATES,
  type TaskStateFacts,
} from "@/lib/task-user-state";
import type { RetainedTurnActivity } from "@/lib/providers/turn-status";

const NONE: TaskStateFacts = { liveTurn: null, pendingDecision: null, agentRun: null, lastTurn: null, result: null };
const facts = (patch: Partial<TaskStateFacts>): TaskStateFacts => ({ ...NONE, ...patch });
const RESULT = { pullRequest: { url: "https://github.com/o/r/pull/128", number: 128 }, changedFiles: 2, answerMessageId: "a1" };

describe("resolveTaskUserState", () => {
  test("has exactly five states, each with a word and a glyph", () => {
    expect([...TASK_USER_STATES]).toEqual(["working", "waiting", "blocked", "finished", "stopped"]);
    for (const state of TASK_USER_STATES) {
      expect(TASK_USER_STATE_LABELS[state].length).toBeGreaterThan(0);
      expect(taskUserStateToWorkState({ state, waitingOn: null })).toBeTruthy();
    }
  });

  test("a task that never ran has no state", () => {
    expect(resolveTaskUserState(NONE)).toBeNull();
  });

  test("whatever waits on the user comes first, even under a running turn or run", () => {
    const running = { badge: "running" as const, reason: null, updatedAt: null };
    expect(resolveTaskUserState(facts({ liveTurn: { pendingInteraction: "user_input" }, agentRun: running }))).toMatchObject({ state: "waiting", waitingOn: "question" });
    expect(resolveTaskUserState(facts({ liveTurn: { pendingInteraction: "approval" } }))).toMatchObject({ state: "waiting", waitingOn: "approval" });
    // An async question outlives its turn: the messages still hold it.
    expect(resolveTaskUserState(facts({ pendingDecision: "question" }))).toMatchObject({ state: "waiting", waitingOn: "question" });
    expect(resolveTaskUserState(facts({ agentRun: { badge: "needs-answer", reason: null, updatedAt: null } }))).toMatchObject({ state: "waiting", waitingOn: "sign-off" });
  });

  test("a paused or halted run holds the task over a card it left open; a live turn's own prompt still asks", () => {
    const paused = { badge: "paused" as const, reason: "You took over.", updatedAt: null };
    expect(resolveTaskUserState(facts({ agentRun: paused, pendingDecision: "approval" }))).toMatchObject({ state: "blocked", reason: "You took over." });
    expect(resolveTaskUserState(facts({ agentRun: paused, pendingDecision: "approval", liveTurn: { pendingInteraction: "approval" } }))).toMatchObject({ state: "waiting", waitingOn: "approval" });
  });

  test("a live turn or a running run is working; a halted or paused run is blocked with its reason", () => {
    expect(resolveTaskUserState(facts({ liveTurn: { pendingInteraction: null } }))?.state).toBe("working");
    expect(resolveTaskUserState(facts({ agentRun: { badge: "running", reason: null, updatedAt: null } }))?.state).toBe("working");
    expect(resolveTaskUserState(facts({ agentRun: { badge: "halted", reason: "Turn limit reached", updatedAt: null } }))).toMatchObject({ state: "blocked", reason: "Turn limit reached" });
    expect(resolveTaskUserState(facts({ agentRun: { badge: "paused", reason: "Paused by you", updatedAt: null } }))?.state).toBe("blocked");
  });

  test("a finished turn carries its result; a failed one carries its error, never both", () => {
    const finished = resolveTaskUserState(facts({ lastTurn: { ending: "completed", error: null, endedAt: null }, result: RESULT }));
    expect(finished).toEqual({ state: "finished", waitingOn: null, reason: null, result: RESULT });
    const failed = resolveTaskUserState(facts({ lastTurn: { ending: "failed", error: "Stream closed", endedAt: null }, result: RESULT }));
    expect(failed).toEqual({ state: "stopped", waitingOn: null, reason: "Stream closed", result: null });
    expect(resolveTaskUserState(facts({ lastTurn: { ending: "cancelled", error: null, endedAt: null } }))).toMatchObject({ state: "stopped", reason: "You stopped it." });
    // An ending nobody reported is not a failure.
    expect(resolveTaskUserState(facts({ lastTurn: { ending: "unknown", error: null, endedAt: null } }))?.state).toBe("finished");
    // Nothing produced: finished without a result.
    expect(resolveTaskUserState(facts({ lastTurn: { ending: "completed", error: null, endedAt: null }, result: { pullRequest: null, changedFiles: 0, answerMessageId: null } }))?.result).toBeNull();
  });

  test("an ended run and the last turn: whichever changed last decides", () => {
    const completedRun = { badge: "completed" as const, reason: null, updatedAt: "2026-09-29T10:00:00.000Z" };
    const laterFailure = { ending: "failed" as const, error: "Boom", endedAt: "2026-09-29T11:00:00.000Z" };
    expect(resolveTaskUserState(facts({ agentRun: completedRun, lastTurn: laterFailure }))?.state).toBe("stopped");
    const earlierFailure = { ...laterFailure, endedAt: "2026-09-29T09:00:00.000Z" };
    expect(resolveTaskUserState(facts({ agentRun: completedRun, lastTurn: earlierFailure, result: RESULT }))).toMatchObject({ state: "finished", result: RESULT });
    const stoppedRun = { badge: "stopped" as const, reason: "Acceptance unmet", updatedAt: "2026-09-29T10:00:00.000Z" };
    expect(resolveTaskUserState(facts({ agentRun: stoppedRun, lastTurn: earlierFailure }))).toMatchObject({ state: "stopped", reason: "Acceptance unmet" });
    // An active run always speaks, whatever the last turn did.
    expect(resolveTaskUserState(facts({ agentRun: { badge: "running", reason: null, updatedAt: "2026-09-29T08:00:00.000Z" }, lastTurn: laterFailure }))?.state).toBe("working");
  });

  test("waiting wears the question or the approval glyph", () => {
    expect(taskUserStateToWorkState({ state: "waiting", waitingOn: "question" })).toBe("needs-you");
    expect(taskUserStateToWorkState({ state: "waiting", waitingOn: "approval" })).toBe("approval");
    expect(taskUserStateToWorkState({ state: "waiting", waitingOn: "sign-off" })).toBe("approval");
  });
});

describe("resolveTurnEnding", () => {
  const receipt = (outcome: "completed" | "failed" | "cancelled" | "unknown", error: string | null = null) => ({
    version: 1 as const, completedAt: "2026-09-29T09:00:00.000Z", outcome, outputObserved: true, error,
    lastError: null, stopReason: null, doneObserved: true, nativeTurnId: null, responseText: null,
  });

  test("the receipt decides over the provider's stop reason", () => {
    expect(resolveTurnEnding({ message: { terminalReceipt: receipt("failed", "Runtime failed"), terminalStopReason: "end_turn" }, retained: null, activity: null }))
      .toEqual({ ending: "failed", error: "Runtime failed" });
    expect(resolveTurnEnding({ message: { terminalReceipt: receipt("completed"), terminalStopReason: "user_abort" }, retained: null, activity: null }))
      .toEqual({ ending: "completed", error: null });
  });

  test("without a receipt: a retained failure, then the stop reason, then unknown", () => {
    const retained = { outcome: "failed", retainedAt: 0, snapshot: { turnError: "Stream closed" } } as unknown as RetainedTurnActivity;
    expect(resolveTurnEnding({ message: null, retained, activity: null })).toEqual({ ending: "failed", error: "Stream closed" });
    expect(resolveTurnEnding({ message: { terminalStopReason: "end_turn" }, retained: null, activity: null })?.ending).toBe("completed");
    expect(resolveTurnEnding({ message: { terminalStopReason: "user_abort" }, retained: null, activity: null })?.ending).toBe("cancelled");
    expect(resolveTurnEnding({ message: { terminalStopReason: "stop_sequence" }, retained: null, activity: null })?.ending).toBe("unknown");
    expect(resolveTurnEnding({ message: {}, retained: null, activity: null })?.ending).toBe("unknown");
    expect(resolveTurnEnding({ message: null, retained: null, activity: null })).toBeNull();
  });
});
