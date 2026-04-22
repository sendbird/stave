import { describe, expect, test } from "bun:test";
import {
  MAX_FILE_CONTEXT_CONTENT_CHARS,
  MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
} from "@/lib/file-context-sanitization";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";

describe("normalizeMessagesForSnapshot", () => {
  test("marks legacy codex diffs as accepted", () => {
    const normalized = normalizeMessagesForSnapshot({
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "assistant",
            model: "gpt-5",
            providerId: "codex",
            content: "",
            parts: [
              {
                type: "code_diff",
                filePath: "src/app.ts",
                oldContent: "a",
                newContent: "b",
                status: "pending",
              },
            ],
          },
        ],
      },
    });

    expect(normalized["task-1"]?.[0]?.parts[0]).toMatchObject({
      type: "code_diff",
      status: "accepted",
    });
  });

  test("keeps non-codex pending diffs unchanged", () => {
    const normalized = normalizeMessagesForSnapshot({
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "assistant",
            model: "claude-sonnet",
            providerId: "claude-code",
            content: "",
            parts: [
              {
                type: "code_diff",
                filePath: "src/app.ts",
                oldContent: "a",
                newContent: "b",
                status: "pending",
              },
            ],
          },
        ],
      },
    });

    expect(normalized["task-1"]?.[0]?.parts[0]).toMatchObject({
      type: "code_diff",
      status: "pending",
    });
  });

  test("sanitizes oversized file context parts", () => {
    const oversizedImagePayload = `data:image/png;base64,${"x".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 32)}`;
    const normalized = normalizeMessagesForSnapshot({
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "",
            parts: [
              {
                type: "file_context",
                filePath: "public/diagram.png",
                content: oversizedImagePayload,
                language: "png",
              },
            ],
          },
        ],
      },
    });

    const normalizedPart = normalized["task-1"]?.[0]?.parts[0];
    expect(normalizedPart).toBeDefined();
    expect(normalizedPart?.type).toBe("file_context");
    if (normalizedPart?.type !== "file_context") {
      throw new Error("expected file_context part");
    }
    expect(normalizedPart.content).toContain("image payload omitted");
    expect(normalizedPart.content).not.toContain("data:image/png;base64");
    expect(normalizedPart.content.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized tool outputs in persisted history", () => {
    const oversizedToolOutput = "y".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 256);
    const normalized = normalizeMessagesForSnapshot({
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            parts: [
              {
                type: "tool_use",
                toolUseId: "tool-1",
                toolName: "bash",
                input: "cat huge.log",
                output: oversizedToolOutput,
                state: "output-available",
              },
            ],
          },
        ],
      },
    });

    const normalizedPart = normalized["task-1"]?.[0]?.parts[0];
    expect(normalizedPart?.type).toBe("tool_use");
    if (normalizedPart?.type !== "tool_use") {
      throw new Error("expected tool_use part");
    }
    expect(normalizedPart.output).toContain("tool output truncated");
    expect(normalizedPart.output?.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized approval descriptions in persisted history", () => {
    const oversizedApprovalDescription = "Input: ".concat("y".repeat(MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS + 256));
    const normalized = normalizeMessagesForSnapshot({
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "assistant",
            model: "claude-sonnet-4-6",
            providerId: "claude-code",
            content: "",
            parts: [
              {
                type: "approval",
                toolName: "ExitPlanMode",
                requestId: "approval-1",
                description: oversizedApprovalDescription,
                state: "approval-requested",
              },
            ],
          },
        ],
      },
    });

    const normalizedPart = normalized["task-1"]?.[0]?.parts[0];
    expect(normalizedPart?.type).toBe("approval");
    if (normalizedPart?.type !== "approval") {
      throw new Error("expected approval part");
    }
    expect(normalizedPart.description).toContain("approval description truncated");
    expect(normalizedPart.description.length).toBeLessThanOrEqual(MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS);
  });
});
