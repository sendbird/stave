import { describe, expect, test } from "bun:test";
import { buildClaudeUserInputPermissionResult } from "../electron/providers/claude-sdk-runtime";
import { createClaudeQuestionCapabilityTracker } from "../electron/providers/claude-question-response";

const input = {
  questions: [
    { header: "Choice", question: "Which option?", options: [{ label: "A" }, { label: "B" }], multiSelect: true },
    { header: "Scope", question: "Which scope?", options: [{ label: "Local" }, { label: "All" }] },
  ],
};

describe("Claude unanswered question responses", () => {
  test("marks only unanswered questions as skipped when the session advertised support", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: input, answers: { "Which option?": "A, B" }, supportsUnanswered: true,
    })).toEqual({
      behavior: "allow",
      updatedInput: {
        ...input,
        answers: { "Which option?": "A, B" },
        annotations: { "Which scope?": { unanswered: "skipped" } },
      },
    });
  });

  test("keeps the legacy payload for an old or unknown strict host", () => {
    for (const supportsUnanswered of [undefined, false]) {
      expect(buildClaudeUserInputPermissionResult({
        normalizedInput: input, answers: { "Which option?": "A, B" }, supportsUnanswered,
      })).toEqual({ behavior: "allow", updatedInput: { ...input, answers: { "Which option?": "A, B" } } });
    }
  });

  test("does not annotate complete answers or change multi-selection text", () => {
    const answers = { "Which option?": " A, B ", "Which scope?": "All" };
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: input, answers, supportsUnanswered: true,
    })).toEqual({ behavior: "allow", updatedInput: { ...input, answers } });
  });

  test("uses original question text and recognizes legacy header-keyed answers", () => {
    const normalizedInput = { questions: [{ header: "Pick", question: "  Which option?  ", options: [{ label: "A" }] }] };
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput, answers: { Pick: "A" }, supportsUnanswered: true,
    })).toEqual({
      behavior: "allow",
      updatedInput: { ...normalizedInput, answers: { Pick: "A", "  Which option?  ": "A" } },
    });
  });

  test("does not consume another question's canonical answer through a header alias", () => {
    const normalizedInput = { questions: [
      { header: "Choice", question: "Scope", options: [{ label: "A" }] },
      { header: "Scope", question: "Which scope?", options: [{ label: "Local" }] },
    ] };
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput, answers: { Scope: "A" }, supportsUnanswered: true,
    })).toEqual({
      behavior: "allow", updatedInput: { ...normalizedInput, answers: { Scope: "A" }, annotations: { "Which scope?": { unanswered: "skipped" } } },
    });
  });

  test("marks blank or missing answers as skipped without inventing text", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: input, answers: { "Which option?": " \n " }, supportsUnanswered: true,
    })).toEqual({
      behavior: "allow",
      updatedInput: { ...input, answers: { "Which option?": " \n " }, annotations: {
        "Which option?": { unanswered: "skipped" }, "Which scope?": { unanswered: "skipped" },
      } },
    });
  });

  test("does not forward untrusted annotations as user intent on any host", () => {
    for (const supportsUnanswered of [false, true]) {
      const result = buildClaudeUserInputPermissionResult({
        normalizedInput: { ...input, annotations: { "Which option?": { unanswered: "dismissed", notes: "model text" } } },
        answers: { "Which option?": "A", "Which scope?": "Local" }, supportsUnanswered,
      });
      expect(result).toEqual({
        behavior: "allow", updatedInput: { ...input, answers: { "Which option?": "A", "Which scope?": "Local" } },
      });
    }
  });

  test("retains denial instead of turning cancel into an allowed unanswered response", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: input, denied: true, supportsUnanswered: true,
    })).toEqual({ behavior: "deny", message: "User declined to answer questions." });
  });
});

describe("Claude unanswered capability negotiation", () => {
  test("requires an exact advertised capability from a valid current init", () => {
    const tracker = createClaudeQuestionCapabilityTracker();
    expect(tracker.captureSupportedSession()).toBeNull();
    for (const capabilities of [undefined, "ask_user_question_unanswered_v1", [], ["unknown"], ["ask_user_question_unanswered_v2"]]) {
      tracker.observeInit({ session_id: "session-1", capabilities });
      expect(tracker.captureSupportedSession()).toBeNull();
    }
    tracker.observeInit({ session_id: "session-1", capabilities: ["unknown", "ask_user_question_unanswered_v1"] });
    expect(tracker.captureSupportedSession()).toBe("session-1");
    expect(tracker.supportsSession("session-1")).toBe(true);
    expect(tracker.supportsSession(null)).toBe(false);
  });

  test("repeated init uses the latest capability list and cannot leak across sessions", () => {
    const tracker = createClaudeQuestionCapabilityTracker();
    const init = { session_id: "session-1", capabilities: ["ask_user_question_unanswered_v1"] };
    tracker.observeInit(init);
    const session = tracker.captureSupportedSession();
    tracker.observeInit(init);
    expect(tracker.supportsSession(session)).toBe(true);
    tracker.observeInit({ session_id: "session-1" });
    expect(tracker.supportsSession(session)).toBe(false);
    tracker.observeInit({ session_id: "session-2", capabilities: init.capabilities });
    expect(tracker.supportsSession(session)).toBe(false);
    expect(tracker.supportsSession("session-2")).toBe(true);
    tracker.observeInit({ capabilities: init.capabilities });
    expect(tracker.captureSupportedSession()).toBeNull();
  });
});
