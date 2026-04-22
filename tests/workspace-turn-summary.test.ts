import { describe, expect, test } from "bun:test";
import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";

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
});
