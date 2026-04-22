import { describe, expect, test } from "bun:test";
import {
  buildProviderTurnPrompt,
  filterPromptRetrievedContext,
  resolveProviderResumeSessionId,
} from "@/lib/providers/provider-request-translators";
import type { CanonicalConversationRequest } from "@/lib/providers/provider.types";

function createConversation(overrides: Partial<CanonicalConversationRequest> = {}): CanonicalConversationRequest {
  return {
    target: {
      providerId: "codex",
      model: "gpt-5.4",
    },
    mode: "chat",
    history: [
      {
        role: "user",
        providerId: "user",
        model: "user",
        content: "Summarize the current repo status.",
        parts: [{ type: "text", text: "Summarize the current repo status." }],
      },
    ],
    input: {
      role: "user",
      providerId: "user",
      model: "user",
      content: "Continue with the runtime refactor.",
      parts: [{ type: "text", text: "Continue with the runtime refactor." }],
    },
    contextParts: [],
    ...overrides,
  };
}

describe("provider request translators", () => {
  test("builds provider prompts from canonical conversation state", () => {
    const prompt = buildProviderTurnPrompt({
      providerId: "codex",
      prompt: "fallback prompt",
      conversation: createConversation(),
    });

    expect(prompt).toContain("[Task Shared Context]");
    expect(prompt).toContain("user: Summarize the current repo status.");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("Continue with the runtime refactor.");
  });

  test("marks skill-only invocations explicitly in provider prompts", () => {
    const prompt = buildProviderTurnPrompt({
      providerId: "claude-code",
      prompt: "",
      conversation: createConversation({
        target: {
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
        },
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "",
          parts: [],
        },
        contextParts: [
          {
            type: "skill_context",
            skills: [
              {
                id: "local:shared:stave-release",
                slug: "stave-release",
                name: "stave-release",
                description: "Prepare a release PR.",
                scope: "local",
                provider: "shared",
                path: "/tmp/stave-release/SKILL.md",
                invocationToken: "$stave-release",
                instructions: "Use this skill to create a versioned release PR for the Stave repository.",
              },
            ],
          },
        ],
      }),
    });

    expect(prompt).toContain("[Activated Skills]");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("[Skill Invocation]");
    expect(prompt).toContain("Follow the activated skill instructions.");
  });

  test("omits replayed history when the canonical request carries a resume conversation id", () => {
    const prompt = buildProviderTurnPrompt({
      providerId: "claude-code",
      prompt: "fallback prompt",
      conversation: createConversation({
        target: {
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
        },
        resume: {
          nativeSessionId: "session_123",
        },
      }),
    });

    expect(prompt).not.toContain("[Task Shared Context]");
    expect(prompt).toContain("[Current User Input]");
  });

  test("preserves Codex resume when the task stays on the same Codex model", () => {
    const conversation = createConversation({
      history: [
        {
          role: "assistant",
          providerId: "codex",
          model: "gpt-5.4",
          content: "Patched the runtime.",
          parts: [{ type: "text", text: "Patched the runtime." }],
        },
      ],
      resume: {
        nativeSessionId: "thread_456",
      },
    });

    const prompt = buildProviderTurnPrompt({
      providerId: "codex",
      prompt: "fallback prompt",
      conversation,
    });

    expect(prompt).not.toContain("[Task Shared Context]");
    expect(resolveProviderResumeSessionId({ conversation })).toBe("thread_456");
  });

  test("reads resume ids from canonical conversation metadata", () => {
    const conversation = createConversation({
      resume: {
        nativeSessionId: "thread_456",
      },
    });

    expect(resolveProviderResumeSessionId({ conversation })).toBe("thread_456");
    expect(resolveProviderResumeSessionId({
      conversation,
      fallbackResumeId: "thread_override",
    })).toBe("thread_override");
  });

  test("can omit MCP-only retrieved context from the rendered prompt", () => {
    const conversation = createConversation({
      contextParts: [
        {
          type: "retrieved_context",
          sourceId: "stave:current-task-awareness",
          title: "Current Stave Task Context",
          content: "MCP-scoped task context",
        },
        {
          type: "retrieved_context",
          sourceId: "stave:repo-map",
          title: "Codebase Map",
          content: "Repo map context",
        },
      ],
    });

    const filtered = filterPromptRetrievedContext({
      conversation,
      excludedSourceIds: ["stave:current-task-awareness"],
    });
    const prompt = buildProviderTurnPrompt({
      providerId: "codex",
      prompt: "fallback prompt",
      conversation: filtered,
    });

    expect(prompt).not.toContain("MCP-scoped task context");
    expect(prompt).toContain("Repo map context");
  });
});
