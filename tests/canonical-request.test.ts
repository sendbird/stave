import { describe, expect, test } from "bun:test";
import {
  MAX_FILE_CONTEXT_CONTENT_CHARS,
  MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
} from "@/lib/file-context-sanitization";
import {
  buildCanonicalConversationRequest,
  buildLegacyPromptFromCanonicalRequest,
} from "@/lib/providers/canonical-request";
import type { ChatMessage } from "@/types/chat";

const history: ChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    model: "user",
    providerId: "user",
    content: "Summarize the repo status.",
    parts: [{ type: "text", text: "Summarize the repo status." }],
  },
  {
    id: "assistant-1",
    role: "assistant",
    model: "gpt-5.4",
    providerId: "codex",
    content: "",
    isPlanResponse: true,
    planText: "1. Check git status\n2. Review recent changes",
    parts: [{ type: "system_event", content: "Plan response generated." }],
  },
];

const skillContext = {
  id: "local:shared:stave-release",
  slug: "stave-release",
  name: "stave-release",
  description: "Prepare a release PR.",
  scope: "local" as const,
  provider: "shared" as const,
  path: "/tmp/stave-release/SKILL.md",
  invocationToken: "$stave-release",
  instructions: "Use this skill to create a versioned release PR for the Stave repository.",
};

describe("canonical request builder", () => {
  test("builds a provider-agnostic request snapshot from task history and current input", () => {
    const request = buildCanonicalConversationRequest({
      turnId: "turn-1",
      taskId: "task-1",
      workspaceId: "workspace-1",
      providerId: "codex",
      model: "gpt-5.4",
      history,
      userInput: "Proceed with step 1.",
      mode: "chat",
      fileContexts: [{
        filePath: "src/store/app.store.ts",
        content: "const answer = 42;",
        language: "ts",
        instruction: "Focus on the provider request path.",
      }],
      nativeSessionId: "thread_123",
    });

    expect(request.target).toEqual({
      providerId: "codex",
      model: "gpt-5.4",
    });
    expect(request.mode).toBe("chat");
    expect(request.history).toHaveLength(2);
    expect(request.input.content).toBe("Proceed with step 1.");
    expect(request.contextParts).toEqual([
      {
        type: "file_context",
        filePath: "src/store/app.store.ts",
        content: "const answer = 42;",
        language: "ts",
        instruction: "Focus on the provider request path.",
      },
    ]);
    expect(request.resume).toEqual({
      nativeSessionId: "thread_123",
    });
  });

  test("rebuilds the current legacy prompt from the canonical request history and input", () => {
    const request = buildCanonicalConversationRequest({
      taskId: "task-1",
      workspaceId: "workspace-1",
      providerId: "codex",
      model: "gpt-5.4",
      history,
      userInput: "Add a migration plan.",
      mode: "chat",
    });

    const prompt = buildLegacyPromptFromCanonicalRequest({
      request,
    });

    expect(prompt).toContain("[Stave Workspace Context]");
    expect(prompt).toContain("workspaceId: workspace-1");
    expect(prompt).toContain("taskId: task-1");
    expect(prompt).toContain("workspacePlanDirectory: .stave/context/plans");
    expect(prompt).toContain("newWorkspacePlanFiles: .stave/context/plans/<taskIdPrefix>_<timestamp>.md");
    expect(prompt).toContain("handoffConvention: write plan files (not workspace notes) when handing off to a new workspace");
    expect(prompt).toContain("[Task Shared Context]");
    expect(prompt).toContain("assistant: 1. Check git status");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("Add a migration plan.");
  });

  test("prefers the trailing response text over accumulated assistant commentary", () => {
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      model: "gpt-5.4",
      history: [{
        id: "assistant-commentary",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "Inspecting the renderer.Final answer.",
        parts: [
          { type: "text", text: "Inspecting the renderer.", segmentId: "commentary-1" },
          { type: "tool_use", toolUseId: "todo-1", toolName: "TodoWrite", input: "{\"todos\":[]}", state: "output-available" },
          { type: "text", text: "Final answer.", segmentId: "final-1" },
        ],
      }],
      userInput: "Continue.",
      mode: "chat",
    });

    expect(request.history[0]?.content).toBe("Final answer.");

    const prompt = buildLegacyPromptFromCanonicalRequest({ request });
    expect(prompt).toContain("assistant: Final answer.");
    expect(prompt).not.toContain("assistant: Inspecting the renderer.Final answer.");
  });

  test("prefers the last provider text segment when Codex emits commentary before the final answer", () => {
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      model: "gpt-5.4",
      history: [{
        id: "assistant-commentary",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "Inspecting the renderer.Final answer.",
        parts: [
          { type: "text", text: "Inspecting the renderer.", segmentId: "commentary-1" },
          { type: "text", text: "Final answer.", segmentId: "final-1" },
        ],
      }],
      userInput: "Continue.",
      mode: "chat",
    });

    expect(request.history[0]?.content).toBe("Final answer.");
  });

  test("marks skill-only invocations explicitly instead of serializing an empty current input", () => {
    const request = buildCanonicalConversationRequest({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      history,
      userInput: "",
      mode: "chat",
      skillContexts: [skillContext],
    });

    const prompt = buildLegacyPromptFromCanonicalRequest({
      request,
    });

    expect(prompt).toContain("[Activated Skills]");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("[Skill Invocation]");
    expect(prompt).toContain("The user intentionally activated one or more skills without additional text.");
  });

  test("sanitizes oversized historical and current file context payloads", () => {
    const oversizedImagePayload = `data:image/svg+xml;base64,${"a".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 128)}`;
    const oversizedTextPayload = "b".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 256);
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      model: "gpt-5.4",
      history: [{
        id: "user-oversized",
        role: "user",
        model: "user",
        providerId: "user",
        content: "",
        parts: [{
          type: "file_context",
          filePath: "public/unnamed88.svg",
          content: oversizedImagePayload,
          language: "svg",
        }],
      }],
      userInput: "Try again.",
      mode: "chat",
      fileContexts: [{
        filePath: "notes/large.md",
        content: oversizedTextPayload,
        language: "md",
      }],
    });

    const historyPart = request.history[0]?.parts[0];
    expect(historyPart).toBeDefined();
    expect(historyPart?.type).toBe("file_context");
    if (historyPart?.type !== "file_context") {
      throw new Error("expected file_context history part");
    }
    expect(historyPart.content).not.toContain("data:image/svg+xml;base64");
    expect(historyPart.content).toContain("image payload omitted");
    expect(historyPart.content.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);

    const contextPart = request.contextParts[0];
    expect(contextPart).toBeDefined();
    expect(contextPart?.type).toBe("file_context");
    if (!contextPart || contextPart.type !== "file_context") {
      throw new Error("expected file_context context part");
    }
    expect(contextPart.content).toContain("content truncated");
    expect(contextPart.content.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized historical tool outputs before serializing history", () => {
    const oversizedToolOutput = "o".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 512);
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      model: "gpt-5.4",
      history: [{
        id: "assistant-oversized-tool",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "",
        parts: [{
          type: "tool_use",
          toolUseId: "tool-1",
          toolName: "bash",
          input: "cat huge.log",
          output: oversizedToolOutput,
          state: "output-available",
        }],
      }],
      userInput: "Summarize that result.",
      mode: "chat",
    });

    const historyPart = request.history[0]?.parts[0];
    expect(historyPart?.type).toBe("tool_use");
    if (!historyPart || historyPart.type !== "tool_use") {
      throw new Error("expected tool_use history part");
    }
    expect(historyPart.output).toContain("tool output truncated");
    expect(historyPart.output?.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized approval descriptions before serializing history", () => {
    const oversizedApprovalDescription = "Input: ".concat("x".repeat(MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS + 512));
    const request = buildCanonicalConversationRequest({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      history: [{
        id: "assistant-approval",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "",
        parts: [{
          type: "approval",
          toolName: "ExitPlanMode",
          requestId: "approval-1",
          description: oversizedApprovalDescription,
          state: "approval-requested",
        }],
      }],
      userInput: "continue",
      mode: "chat",
    });

    const historyPart = request.history[0]?.parts[0];
    expect(historyPart?.type).toBe("approval");
    if (!historyPart || historyPart.type !== "approval") {
      throw new Error("expected approval history part");
    }
    expect(historyPart.description).toContain("approval description truncated");
    expect(historyPart.description.length).toBeLessThanOrEqual(MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS);
  });
});
