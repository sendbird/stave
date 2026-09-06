import { describe, expect, test } from "bun:test";
import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseTurnSummaryDurableFacts,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";
import {
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
  LEGACY_DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
  LEGACY_FACTS_PROMPT_WORKSPACE_TURN_SUMMARY,
  normalizeWorkspaceTurnSummaryPrompt,
} from "@/lib/providers/prompt-defaults";

describe("workspace turn summary helpers", () => {
  test("builds a prompt with instruction and latest turn context", () => {
    const prompt = buildWorkspaceTurnSummaryPrompt({
      instructionPrompt: "Return JSON only.",
      taskTitle: "Workspace summary",
      userRequest: "Summarise the latest turn.",
      assistantResponse: "Implemented the panel card and settings fields.",
    });

    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain("Task title: Workspace summary");
    expect(prompt).toContain("Latest user request:");
    expect(prompt).toContain("Latest assistant response:");
  });

  test("parses strict JSON responses", () => {
    expect(
      parseWorkspaceTurnSummaryResponse(
        '{"requestSummary":"Add an Information panel summary.","workSummary":"Wired the summary card and background generation."}',
      ),
    ).toEqual({
      requestSummary: "Add an Information panel summary.",
      workSummary: "Wired the summary card and background generation.",
      durableFacts: [],
    });
  });

  test("parses fenced JSON responses", () => {
    expect(
      parseWorkspaceTurnSummaryResponse(
        '```json\n{"requestSummary":"Capture the latest request.","workSummary":"Stored the summary on the workspace."}\n```',
      ),
    ).toEqual({
      requestSummary: "Capture the latest request.",
      workSummary: "Stored the summary on the workspace.",
      durableFacts: [],
    });
  });

  test("falls back to labeled plain-text lines", () => {
    expect(
      parseWorkspaceTurnSummaryResponse(
        "Request: Capture the latest task goal.\nWork: Added an automatic summary card to the Information panel.",
      ),
    ).toEqual({
      requestSummary: "Capture the latest task goal.",
      workSummary:
        "Added an automatic summary card to the Information panel.",
      durableFacts: [],
    });
  });

  test("creates persisted workspace summary records", () => {
    expect(
      createWorkspaceTurnSummary({
        turnId: "turn-1",
        taskId: "task-1",
        taskTitle: "Workspace summary",
        model: "gpt-5.4-mini",
        generatedAt: "2026-04-10T00:00:00.000Z",
        draft: {
          requestSummary: "Summarise the latest workspace activity.",
          workSummary: "Updated the Information panel summary card.",
        },
      }),
    ).toEqual({
      turnId: "turn-1",
      taskId: "task-1",
      taskTitle: "Workspace summary",
      model: "gpt-5.4-mini",
      generatedAt: "2026-04-10T00:00:00.000Z",
      requestSummary: "Summarise the latest workspace activity.",
      workSummary: "Updated the Information panel summary card.",
    });
  });

  test("keeps at most one well-formed memory candidate and drops the rest", () => {
    const parsed = parseWorkspaceTurnSummaryResponse(
      JSON.stringify({
        requestSummary: "Add memory.",
        workSummary: "Added it.",
        durableFacts: [
          { kind: "rumor", content: "Not a known kind." },
          { kind: "fact", content: "" },
          { kind: "gotcha", content: "x".repeat(281) },
          { kind: "convention", content: "  Use Bun   commands. " },
          { kind: "decision", content: "Memory is project-scoped." },
          { kind: "fact", content: "FTS5 is available in the bundled SQLite." },
          { kind: "fact", content: "A fourth valid fact is dropped." },
        ],
      }),
    );
    expect(parsed?.durableFacts).toEqual([
      { kind: "convention", content: "Use Bun commands." },
    ]);
  });

  test("a summary without durableFacts still parses with an empty list", () => {
    expect(
      parseWorkspaceTurnSummaryResponse(
        '{"requestSummary":"a","workSummary":"b"}',
      )?.durableFacts,
    ).toEqual([]);
    expect(parseTurnSummaryDurableFacts("nope")).toEqual([]);
  });

  test("an untouched legacy default prompt migrates to the durableFacts default", () => {
    expect(
      normalizeWorkspaceTurnSummaryPrompt(
        `${LEGACY_DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY.replaceAll("\n", "\r\n")}\n`,
      ),
    ).toBe(DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY);
    expect(DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY).toContain("durableFacts");
    expect(normalizeWorkspaceTurnSummaryPrompt(LEGACY_FACTS_PROMPT_WORKSPACE_TURN_SUMMARY)).toBe(DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY);
    expect(normalizeWorkspaceTurnSummaryPrompt("My own prompt.")).toBe(
      "My own prompt.",
    );
    expect(normalizeWorkspaceTurnSummaryPrompt("")).toBe("");
  });
});
