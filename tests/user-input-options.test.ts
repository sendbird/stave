import { describe, expect, test } from "bun:test";
import { mapCodexUserInputQuestions } from "../electron/providers/codex-user-input-mapping";
import {
  CursorAskQuestionRequestSchema,
  mapCursorAskQuestionEvent,
} from "../electron/providers/cursor/cursor-acp-extensions";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import {
  markRecommendedUserInputOptions,
  recommendedOptionDefaultValue,
  resolveRecommendedOptionIndex,
  shouldShowUserInputRecommendedBadge,
} from "@/lib/user-input-options";

const OPTIONS = [
  { label: "Keep current", description: "Leave the existing path." },
  { label: "Switch approach", description: "Use the safer path." },
  { label: "Defer", description: "Decide later." },
];

describe("resolveRecommendedOptionIndex", () => {
  test("does not treat the first option as recommended by default", () => {
    expect(resolveRecommendedOptionIndex({ options: OPTIONS })).toBeNull();
  });

  test("does not treat a question-level true flag as the first option", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: OPTIONS,
        recommend: true,
      }),
    ).toBeNull();
  });

  test("honors an option-level recommended flag that is not first", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: [
          OPTIONS[0]!,
          { ...OPTIONS[1]!, recommended: true },
          OPTIONS[2]!,
        ],
      }),
    ).toBe(1);
  });

  test("honors a 0-based recommend index for the second option", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: OPTIONS,
        recommend: 1,
      }),
    ).toBe(1);
  });

  test("honors a 1-based recommend index only when 0-based is out of range", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: OPTIONS,
        recommend: 3,
      }),
    ).toBe(2);
  });

  test("honors a recommend pointer that names the second option", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: OPTIONS.map((option, index) => ({
          ...option,
          value: `opt-${index}`,
        })),
        recommend: "opt-1",
      }),
    ).toBe(1);
  });

  test("honors a (Recommended) suffix on a later option", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: [
          OPTIONS[0]!,
          { ...OPTIONS[1]!, label: "Switch approach (Recommended)" },
          OPTIONS[2]!,
        ],
      }),
    ).toBe(1);
  });

  test("prefers an explicit later flag over a first-option label suffix", () => {
    expect(
      resolveRecommendedOptionIndex({
        options: [
          { ...OPTIONS[0]!, label: "Keep current (Recommended)" },
          { ...OPTIONS[1]!, recommended: true },
          OPTIONS[2]!,
        ],
      }),
    ).toBe(1);
  });
});

describe("markRecommendedUserInputOptions", () => {
  test("marks only the pointed option and leaves the first unmarked", () => {
    expect(
      markRecommendedUserInputOptions({
        options: OPTIONS,
        recommend: 1,
      }).map((option) => option.recommended === true),
    ).toEqual([false, true, false]);
  });

  test("keeps only one explicit recommended flag when several options are marked", () => {
    const marked = markRecommendedUserInputOptions({
      options: [
        { ...OPTIONS[0]!, recommended: true },
        { ...OPTIONS[1]!, recommended: true },
        OPTIONS[2]!,
      ],
    });
    expect(marked.map((option) => option.recommended === true)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("shouldShowUserInputRecommendedBadge", () => {
  test("ignores a first-option label suffix once an explicit flag exists", () => {
    const options = [
      { ...OPTIONS[0]!, label: "Keep current (Recommended)" },
      { ...OPTIONS[1]!, recommended: true },
    ];
    expect(
      shouldShowUserInputRecommendedBadge({
        option: options[0]!,
        options,
      }),
    ).toBe(false);
    expect(
      shouldShowUserInputRecommendedBadge({
        option: options[1]!,
        options,
      }),
    ).toBe(true);
  });
});

describe("recommendedOptionDefaultValue", () => {
  test("uses the marked option instead of the first listed option", () => {
    expect(
      recommendedOptionDefaultValue({
        options: markRecommendedUserInputOptions({
          options: OPTIONS,
          recommend: 1,
        }),
      }),
    ).toBe("Switch approach");
  });
});

describe("user-input recommend contracts", () => {
  test("keeps a later recommended option through Codex user-input mapping", () => {
    const questions = mapCodexUserInputQuestions([
      {
        header: "Approach",
        question: "Which approach?",
        options: [
          { label: "Keep current", description: "Leave it." },
          {
            label: "Switch",
            description: "Use the safer path.",
            recommended: true,
          },
        ],
      },
    ]);
    expect(questions[0]?.options.map((option) => option.recommended)).toEqual([
      undefined,
      true,
    ]);
    expect(questions[0]?.defaultValue).toBe("Switch");
  });

  test("keeps a later recommended option through Cursor ask_question mapping", () => {
    const parsed = CursorAskQuestionRequestSchema.parse({
      toolCallId: "tool-question",
      title: "Choose mode",
      questions: [
        {
          id: "mode",
          prompt: "Which mode?",
          options: [
            { id: "agent", label: "Agent" },
            { id: "plan", label: "Plan", recommended: true },
          ],
        },
      ],
    });
    const event = mapCursorAskQuestionEvent({
      requestId: "req-1",
      request: parsed,
    });
    expect(event.type).toBe("user_input");
    if (event.type !== "user_input") {
      throw new Error("Expected a user_input event.");
    }
    expect(
      event.questions[0]?.options.map((option) => option.recommended),
    ).toEqual([undefined, true]);
    expect(event.questions[0]?.defaultValue).toBe("plan");
  });

  test("preserves recommended on a later option in the normalized event schema", () => {
    const parsed = NormalizedProviderEventSchema.parse({
      type: "user_input",
      toolName: "AskUserQuestion",
      requestId: "req-1",
      questions: [
        {
          header: "Approach",
          question: "Which approach?",
          options: [
            { label: "Keep current", description: "Leave it." },
            {
              label: "Switch",
              description: "Use the safer path.",
              recommended: true,
            },
          ],
        },
      ],
    });
    expect(parsed.type).toBe("user_input");
    if (parsed.type !== "user_input") {
      throw new Error("Expected a user_input event.");
    }
    expect(parsed.questions[0]?.options[0]?.recommended).toBeUndefined();
    expect(parsed.questions[0]?.options[1]?.recommended).toBe(true);
  });
});
