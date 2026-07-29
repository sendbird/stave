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

  test("summarizes recorded answers after the request settles", () => {
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
    expect(html).toContain("Your response was sent to the agent.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
