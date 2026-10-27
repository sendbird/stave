import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildQuestionOptionRows,
  getCustomAnswerShortcut,
} from "@/components/ai-elements/question-option-rows";
import { UserInputCard } from "@/components/ai-elements/user-input-card";

const options = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ label: `Option ${index + 1}` }));

describe("question option rows", () => {
  test("map each option to its value, display label, selection and number key", () => {
    const rows = buildQuestionOptionRows({
      question: {
        options: [
          { label: "Staging", value: "stage", description: "Safe" },
          { label: "Production (추천)", description: "  " },
        ],
      },
      selectedValues: ["Production (추천)"],
      showShortcuts: true,
    });

    expect(rows).toEqual([
      {
        value: "stage",
        label: "Staging",
        description: "Safe",
        recommended: false,
        selected: false,
        shortcut: 1,
      },
      {
        // The submitted value keeps the agent's label; the shown one drops the marker.
        value: "Production (추천)",
        label: "Production",
        description: null,
        recommended: true,
        selected: true,
        shortcut: 2,
      },
    ]);
  });

  test("offer number keys only for the first nine options", () => {
    const rows = buildQuestionOptionRows({
      question: { options: options(11) },
      selectedValues: [],
      showShortcuts: true,
    });
    expect(rows.map((row) => row.shortcut)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, null, null,
    ]);
  });

  test("carry no number keys where the keys do nothing", () => {
    const rows = buildQuestionOptionRows({
      question: { options: options(3) },
      selectedValues: ["Option 2"],
      showShortcuts: false,
    });
    expect(rows.every((row) => row.shortcut === null)).toBe(true);
    expect(rows.map((row) => row.selected)).toEqual([false, true, false]);
  });

  test("the free-text row takes the key after the options while one is left", () => {
    expect(getCustomAnswerShortcut({ optionCount: 3, showShortcuts: true })).toBe(4);
    expect(getCustomAnswerShortcut({ optionCount: 8, showShortcuts: true })).toBe(9);
    expect(getCustomAnswerShortcut({ optionCount: 9, showShortcuts: true })).toBeNull();
    expect(getCustomAnswerShortcut({ optionCount: 3, showShortcuts: false })).toBeNull();
  });

  test("single choice leads with a radio, several choices with a checkbox", () => {
    const render = (multiSelect: boolean) =>
      renderToStaticMarkup(
        createElement(UserInputCard, {
          toolName: "AskUserQuestion",
          questions: [
            { key: "pick", header: "", question: "Pick", options: options(2), multiSelect },
          ],
          state: "input-requested",
          presentation: "composer",
        }),
      );
    expect(render(false)).toContain('type="radio"');
    expect(render(false)).not.toContain('type="checkbox"');
    expect(render(true)).toContain('type="checkbox"');
  });

  test("an answered record keeps its rows but shows no number keys", () => {
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "AskUserQuestion",
        questions: [{ key: "pick", header: "", question: "Pick", options: options(2) }],
        state: "input-responded",
        answers: { pick: "Option 2" },
      }),
    );
    expect(html).toContain("Option 1");
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="Option 2"/);
    expect(html).not.toContain("<kbd");
    expect(html).not.toContain("aria-keyshortcuts");
  });
});
