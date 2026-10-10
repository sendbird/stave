import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UserInputCard } from "@/components/ai-elements/user-input-card";

const QUESTIONS = [
  {
    key: "scope",
    header: "Scope",
    question: "Which scope should be used?",
    options: [
      {
        label: "Focused",
        description: "Keep the change focused.",
      },
      {
        label: "Broad",
        description: "Update adjacent surfaces too.",
        recommended: true,
      },
    ],
  },
];

describe("UserInputCard", () => {
  test("renders an accessible composer without exposing the tool name", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "AskUserQuestion",
        questions: QUESTIONS,
        state: "input-requested",
        presentation: "composer",
      }),
    );

    expect(html).toContain("Agent needs your input");
    expect(html).toContain("Keep the change focused.");
    expect(html).toContain('type="radio"');
    expect(html).toContain("Write a different answer");
    expect(html).toContain("Continue");
    expect(html).toContain("Decline to answer");
    expect(html).not.toContain("AskUserQuestion");
    expect(html).toContain("Recommended");
    expect(html.indexOf("Broad")).toBeLessThan(html.lastIndexOf("Recommended"));
    expect(html.indexOf("Focused")).toBeLessThan(html.indexOf("Broad"));
  });

  test("does not mark the first option as recommended when no option is flagged", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "AskUserQuestion",
        questions: [
          {
            ...QUESTIONS[0]!,
            options: QUESTIONS[0]!.options.map((option) => ({
              label: option.label,
              description: option.description,
            })),
          },
        ],
        state: "input-requested",
        presentation: "composer",
      }),
    );

    expect(html).not.toContain("Recommended");
  });

  test("keeps the trace copy compact while the composer owns the response", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: QUESTIONS,
        state: "input-requested",
        presentation: "summary",
      }),
    );

    expect(html).toContain("Question ready");
    expect(html).toContain("Which scope should be used?");
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("Continue");
  });

  test("keeps answered questions and choices visible as a read-only record", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: QUESTIONS,
        state: "input-responded",
        answers: { scope: "Focused" },
      }),
    );

    expect(html).toContain("Answered");
    expect(html).toContain("Focused");
    expect(html).toContain("Which scope should be used?");
    expect(html).toContain("Update adjacent surfaces too.");
    expect(html).toContain("Recommended");
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="Focused"/);
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="Broad"/);
    expect(html).not.toContain("Continue");
    expect(html).not.toContain("Write a different answer");
    expect(html).not.toContain("Decline to answer");
    expect(html).toContain("Your response was sent to the agent.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  test("marks recorded option values in every presentation after restoring history", () => {
    for (const presentation of [
      "inline",
      "summary",
      "composer",
      "embedded",
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(UserInputCard, {
          toolName: "request_user_input",
          questions: [
            {
              ...QUESTIONS[0]!,
              options: QUESTIONS[0]!.options.map((option) => ({
                ...option,
                value: option.label.toLowerCase(),
              })),
              defaultValue: "broad",
            },
          ],
          state: "input-responded",
          answers: { scope: "focused" },
          presentation,
        }),
      );
      const inputs = html.match(/<input\b[^>]*>/g) ?? [];
      expect(
        inputs.filter((input) => input.includes('checked=""')),
      ).toHaveLength(1);
      expect(
        inputs.find((input) => input.includes('value="focused"')),
      ).toContain('checked=""');
      expect(inputs.every((input) => input.includes('disabled=""'))).toBe(true);
      expect(html).not.toContain("<form");
    }
  });

  test("preserves multi-select and custom answers from comma and newline formats", () => {
    for (const answer of [
      "Focused, Broad, Keep the draft",
      "Focused\nBroad\nKeep the draft",
    ]) {
      const html = renderToStaticMarkup(
        createElement(UserInputCard, {
          toolName: "AskUserQuestion",
          questions: [{ ...QUESTIONS[0]!, multiSelect: true }],
          state: "input-responded",
          answers: { scope: answer },
        }),
      );
      const inputs = html.match(/<input\b[^>]*>/g) ?? [];
      expect(inputs).toHaveLength(2);
      expect(
        inputs.every(
          (input) =>
            input.includes('type="checkbox"') &&
            input.includes('checked=""') &&
            input.includes('disabled=""'),
        ),
      ).toBe(true);
      expect(html).toContain("Keep the draft");
      expect(html).not.toContain("<textarea");
      expect(html).not.toContain("Add another answer");
    }
  });

  test("preserves free text without inventing a selection from the default", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: [{ ...QUESTIONS[0]!, defaultValue: "Broad" }],
        state: "input-responded",
        answers: {
          scope: "A different plan, with two phases\nKeep the review",
        },
      }),
    );
    expect(html).toContain(
      "A different plan, with two phases\nKeep the review",
    );
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain("<textarea");

    const missing = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: [{ ...QUESTIONS[0]!, defaultValue: "Broad" }],
        state: "input-responded",
      }),
    );
    expect(missing).toContain("No answer");
    expect(missing).not.toContain('checked=""');
  });

  test("keeps commas in newline-delimited choices and free-text history", () => {
    const question = {
      ...QUESTIONS[0]!,
      multiSelect: true,
      options: [{ label: "Docs, tests" }, { label: "Runtime" }],
    };
    const selected = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: [question],
        state: "input-responded",
        answers: { scope: "Docs, tests\nRuntime" },
      }),
    );
    const inputs = selected.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.filter((input) => input.includes('checked=""'))).toHaveLength(2);
    expect(selected).not.toContain("No answer");

    const text = "Keep this, including commas\nand the next line";
    const custom = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "request_user_input",
        questions: [question],
        state: "input-responded",
        answers: { scope: text },
      }),
    );
    expect(custom).toContain(text);
    expect(custom).not.toContain('checked=""');
  });

  test("reads older trace answers filed under the question header", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "AskUserQuestion",
        questions: [{ ...QUESTIONS[0]!, key: undefined }],
        state: "input-responded",
        answers: { Scope: "Broad" },
      }),
    );
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="Broad"/);
    expect(html).not.toContain("No answer");
  });

  test("denied and interrupted requests never mark a default as an answer", () => {
    for (const state of ["input-denied", "input-interrupted"] as const) {
      const html = renderToStaticMarkup(
        createElement(UserInputCard, {
          toolName: "request_user_input",
          questions: [{ ...QUESTIONS[0]!, defaultValue: "Broad" }],
          state,
        }),
      );
      expect(html).not.toContain('type="radio"');
      expect(html).not.toContain("Answered");
      expect(html).not.toContain("Continue");
    }
  });
});
