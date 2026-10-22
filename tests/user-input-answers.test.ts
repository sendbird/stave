import { describe, expect, test } from "bun:test";
import { encodeClarificationAnswers } from "@/components/session/message/turn-event-decisions";
import {
  encodeUserInputSelection,
  getUserInputAnswerKey,
  isUserInputAnswerRequired,
  readUserInputAnswer,
} from "@/lib/user-input-answers";
import type { UserInputQuestion } from "@/types/chat";

const environment: UserInputQuestion = {
  header: "Env",
  question: "Which environment should this deploy to?",
  options: [{ label: "Staging" }, { label: "Production" }],
};
const checks: UserInputQuestion = {
  key: "checks",
  header: "Checks",
  question: "Which checks should run?",
  multiSelect: true,
  options: [{ label: "Unit, fast" }, { label: "E2E" }],
};

describe("one answer encoding for every answering surface", () => {
  test("an answer is filed under the question's key, or its text without one", () => {
    // Claude matches AskUserQuestion answers by question text; a header
    // ("Env") is a chip label, not an answer key.
    expect(getUserInputAnswerKey(environment)).toBe(
      "Which environment should this deploy to?",
    );
    expect(getUserInputAnswerKey(checks)).toBe("checks");
    expect(getUserInputAnswerKey({ ...checks, key: "  " })).toBe(
      "Which checks should run?",
    );
  });

  test("several picks are one string joined with a comma", () => {
    expect(encodeUserInputSelection(["Unit, fast", " E2E ", ""])).toBe(
      "Unit, fast, E2E",
    );
    expect(encodeUserInputSelection([])).toBe("");
  });

  test("a question is required unless marked optional; a link notice asks nothing", () => {
    expect(isUserInputAnswerRequired(environment)).toBe(true);
    expect(isUserInputAnswerRequired({ ...environment, required: false })).toBe(
      false,
    );
    expect(
      isUserInputAnswerRequired({ ...environment, inputType: "url_notice" }),
    ).toBe(false);
  });

  test("the transcript files its answers the way the composer does", () => {
    expect(
      encodeClarificationAnswers({
        questions: [
          environment,
          checks,
          { ...environment, inputType: "url_notice", question: "Read the notice" },
        ],
        drafts: {
          "Which environment should this deploy to?": ["Production"],
          checks: ["Unit, fast", "E2E"],
          "Read the notice": ["ignored"],
        },
      }),
    ).toEqual({
      "Which environment should this deploy to?": "Production",
      checks: "Unit, fast, E2E",
    });
  });

  test("answers recorded under the old header or position keys still read back", () => {
    expect(
      readUserInputAnswer({
        answers: { Env: "Staging" },
        question: environment,
        index: 0,
      }),
    ).toBe("Staging");
    expect(
      readUserInputAnswer({
        answers: { "question-1": "E2E" },
        question: { ...checks, key: undefined, header: "" },
        index: 1,
      }),
    ).toBe("E2E");
    // The current key wins over an older one for the same question.
    expect(
      readUserInputAnswer({
        answers: {
          Env: "Staging",
          "Which environment should this deploy to?": "Production",
        },
        question: environment,
        index: 0,
      }),
    ).toBe("Production");
    expect(
      readUserInputAnswer({ answers: undefined, question: environment, index: 0 }),
    ).toBeUndefined();
  });
});
