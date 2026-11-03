import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseClaudeQuestionList } from "../electron/providers/claude-user-input";
import { MAX_OPTION_PREVIEW_LENGTH } from "@/lib/user-input-options";
import { mapCodexUserInputQuestions } from "../electron/providers/codex-user-input-mapping";
import { mapCursorAskQuestionEvent } from "../electron/providers/cursor/cursor-acp-extensions";
import { StreamTurnArgsSchema } from "../electron/main/ipc/provider-conversation-schemas";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import { buildQuestionOptionRows } from "@/components/ai-elements/question-option-rows";
import { UserInputCard } from "@/components/ai-elements/user-input-card";

const SNIPPET = "<div className={styles.scroll}>\n  <table>…</table>\n</div>";

const claudeInput = {
  questions: [
    {
      header: "Layout",
      question: "How should the billing table behave below 600px?",
      options: [
        { label: "Scroll container", description: "Wrap the table so it scrolls.", preview: SNIPPET },
        { label: "Card list", description: "Stack each row.", preview: "   " },
        { label: "Hide columns", description: "Drop Tax and Discount." },
      ],
    },
  ],
};

describe("option preview mapping", () => {
  test("Claude AskUserQuestion keeps a preview as written and drops a blank one", () => {
    const [question] = parseClaudeQuestionList({ input: claudeInput });
    expect(question?.options[0]?.preview).toBe(SNIPPET);
    expect(question?.options[1]).not.toHaveProperty("preview");
    expect(question?.options[2]).not.toHaveProperty("preview");
  });

  test("Claude bounds an oversized preview to the IPC limit", () => {
    const [question] = parseClaudeQuestionList({
      input: {
        questions: [
          {
            header: "Big",
            question: "Which?",
            options: [{ label: "A", description: "a", preview: "x".repeat(MAX_OPTION_PREVIEW_LENGTH + 50) }],
          },
        ],
      },
    });
    expect(question?.options[0]?.preview?.length).toBe(MAX_OPTION_PREVIEW_LENGTH);
  });

  test("Codex and Cursor questions have no preview field, so none is mapped", () => {
    const [codex] = mapCodexUserInputQuestions([
      {
        id: "layout",
        header: "Layout",
        question: "Which?",
        options: [{ label: "A", description: "a", preview: "not in the protocol" }],
      },
    ]);
    expect(codex?.options[0]).not.toHaveProperty("preview");
    const cursor = mapCursorAskQuestionEvent({
      requestId: "r",
      request: {
        toolCallId: "t",
        questions: [{ id: "q", prompt: "Which?", options: [{ id: "a", label: "A" }] }],
      },
    });
    expect(cursor.type === "user_input" ? cursor.questions[0]?.options[0] : null).not.toHaveProperty("preview");
  });

  test("the normalized event schema and the IPC conversation schema carry the preview", () => {
    const [question] = parseClaudeQuestionList({ input: claudeInput });
    const event = NormalizedProviderEventSchema.parse({
      type: "user_input",
      toolName: "AskUserQuestion",
      requestId: "req-1",
      questions: [question],
    });
    expect(event.type === "user_input" ? event.questions[0]?.options[0]?.preview : null).toBe(SNIPPET);

    // The renderer sends history back to main through a strict schema; a
    // preview the schema did not list would fail the whole turn.
    const history = [
      {
        role: "assistant",
        providerId: "claude-code",
        model: "claude-test",
        content: "",
        parts: [
          {
            type: "user_input",
            requestId: "req-1",
            toolName: "AskUserQuestion",
            state: "input-requested",
            questions: [question],
          },
        ],
      },
    ];
    const args = {
      providerId: "claude-code",
      prompt: "continue",
      runtimeOptions: {},
      conversation: {
        target: { providerId: "claude-code" },
        mode: "chat",
        history,
        input: { role: "user", content: "continue", parts: [] },
        contextParts: [],
      },
    };
    const parsed = StreamTurnArgsSchema.safeParse(args);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  test("a saved message keeps the preview, so a reopened question still shows it", () => {
    const [question] = parseClaudeQuestionList({ input: claudeInput });
    const parsed = ChatMessageSchema.safeParse({
      id: "m1",
      role: "assistant",
      model: "claude-test",
      providerId: "claude-code",
      content: "",
      parts: [
        {
          type: "user_input",
          requestId: "req-1",
          toolName: "AskUserQuestion",
          state: "input-requested",
          questions: [question],
        },
      ],
    });
    expect(parsed.error?.issues ?? []).toEqual([]);
    const part = parsed.data?.parts[0];
    expect(part?.type === "user_input" ? part.questions[0]?.options[0]?.preview : null).toBe(SNIPPET);
  });

  test("the row model carries the preview only where one was sent", () => {
    const [question] = parseClaudeQuestionList({ input: claudeInput });
    const rows = buildQuestionOptionRows({ question: question!, selectedValues: [], showShortcuts: true });
    expect(rows.map((row) => row.preview)).toEqual([SNIPPET, null, null]);
  });
});

describe("UserInputCard option preview", () => {
  test("shows no preview area before an option takes focus or the pointer", () => {
    const [question] = parseClaudeQuestionList({ input: claudeInput });
    const html = renderToStaticMarkup(
      createElement(UserInputCard, {
        toolName: "AskUserQuestion",
        questions: [question!],
        state: "input-requested",
        presentation: "composer",
      }),
    );
    expect(html).toContain("Scroll container");
    expect(html).not.toContain("data-option-preview");
    expect(html).not.toContain(SNIPPET.split("\n")[0]!.replace(/</g, "&lt;"));
  });
});
