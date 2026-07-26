import { describe, expect, test } from "bun:test";
import {
  ADVISOR_ADVICE_MAX_CHARS,
  ADVISOR_CONTEXT_SOURCE_ID,
  ADVISOR_PROMPT_MAX_CHARS,
  appendAdvisorAdvice,
  boundAdvisorAdvice,
  buildAdvisorPrompt,
  isSupportedAdvisorTarget,
  migrateLegacyClaudeAdvisorModel,
  normalizeAdvisorTarget,
  normalizePersistedAdvisorTarget,
  shouldRunAdvisor,
  withoutAdvisorTarget,
} from "@/lib/providers/advisor";
import type { CanonicalConversationRequest } from "@/lib/providers/provider.types";

function createConversation(
  input = "Implement the provider-neutral Advisor.",
): CanonicalConversationRequest {
  return {
    target: {
      providerId: "claude-code",
      model: "claude-sonnet-5",
    },
    mode: "chat",
    history: [],
    input: {
      role: "user",
      providerId: "user",
      content: input,
      parts: [{ type: "text", text: input }],
    },
    contextParts: [],
  };
}

describe("Advisor settings migration", () => {
  test.each([
    ["", null],
    [
      "claude-haiku-4-5",
      { providerId: "claude-code", model: "claude-sonnet-5" },
    ],
    [
      "claude-sonnet-4-6",
      { providerId: "claude-code", model: "claude-opus-5" },
    ],
    [
      "claude-opus-5[1m]",
      { providerId: "claude-code", model: "claude-opus-5" },
    ],
    ["claude-fable-5", { providerId: "claude-code", model: "claude-fable-5" }],
    [
      "claude-sonnet-5[1m]",
      { providerId: "claude-code", model: "claude-sonnet-5[1m]" },
    ],
    [
      "claude-sonnet-future",
      { providerId: "claude-code", model: "claude-sonnet-future" },
    ],
    [
      "claude-unknown-advisor",
      { providerId: "claude-code", model: "claude-unknown-advisor" },
    ],
  ])("migrates legacy value %s", (legacy, expected) => {
    expect(migrateLegacyClaudeAdvisorModel(legacy)).toEqual(expected);
  });

  test("normalizes only provider/model objects with a non-empty model", () => {
    expect(
      normalizeAdvisorTarget({
        providerId: "codex",
        model: "  gpt-5.6-sol  ",
      }),
    ).toEqual({ providerId: "codex", model: "gpt-5.6-sol" });
    expect(
      normalizeAdvisorTarget({ providerId: "unknown", model: "model" }),
    ).toBeNull();
    expect(
      normalizeAdvisorTarget({ providerId: "codex", model: " " }),
    ).toBeNull();
  });

  test("prefers the new target field and falls back to the legacy field", () => {
    expect(
      normalizePersistedAdvisorTarget({
        advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" },
        claudeAdvisorModel: "claude-haiku-4-5",
      }),
    ).toEqual({ providerId: "codex", model: "gpt-5.6-sol" });
    expect(
      normalizePersistedAdvisorTarget({
        claudeAdvisorModel: "claude-haiku-4-5",
      }),
    ).toEqual({ providerId: "claude-code", model: "claude-sonnet-5" });
    expect(
      normalizePersistedAdvisorTarget({
        advisorTarget: null,
        claudeAdvisorModel: "claude-haiku-4-5",
      }),
    ).toBeNull();
  });
});

describe("Advisor turn preparation", () => {
  test("supports every Claude/Codex executor and Advisor pairing", () => {
    for (const executor of ["claude-code", "codex"] as const) {
      for (const target of [
        { providerId: "claude-code", model: "claude-fable-5" },
        { providerId: "codex", model: "gpt-5.6-terra" },
      ] as const) {
        const conversation = {
          ...createConversation(),
          target: { providerId: executor },
        };
        expect(isSupportedAdvisorTarget(target)).toBe(true);
        expect(shouldRunAdvisor({ conversation, target })).toBe(true);
      }
    }
  });

  test("excludes native slash commands and nested Advisor context", () => {
    const target = {
      providerId: "codex",
      model: "gpt-5.6-terra",
    } as const;
    expect(
      shouldRunAdvisor({
        conversation: createConversation("/goal finish this task"),
        target,
      }),
    ).toBe(false);
    expect(
      shouldRunAdvisor({
        conversation: {
          ...createConversation(),
          contextParts: [
            {
              type: "retrieved_context",
              sourceId: ADVISOR_CONTEXT_SOURCE_ID,
              content: "existing advice",
            },
          ],
        },
        target,
      }),
    ).toBe(false);
  });

  test("builds bounded advice context without mutating the request", () => {
    const conversation = createConversation();
    const next = appendAdvisorAdvice({
      conversation,
      target: {
        providerId: "claude-code",
        model: "claude-fable-5",
      },
      advice: "a".repeat(ADVISOR_ADVICE_MAX_CHARS + 500),
    });

    expect(conversation.contextParts).toHaveLength(0);
    expect(next.contextParts).toHaveLength(1);
    expect(next.contextParts[0]).toMatchObject({
      type: "retrieved_context",
      sourceId: ADVISOR_CONTEXT_SOURCE_ID,
      title: "Claude Advisor · claude-fable-5",
    });
    expect(next.contextParts[0]?.content.length).toBeLessThanOrEqual(
      ADVISOR_ADVICE_MAX_CHARS,
    );
    expect(buildAdvisorPrompt({ conversation })).toContain(
      "Implement the provider-neutral Advisor.",
    );
    expect(
      boundAdvisorAdvice("a".repeat(ADVISOR_ADVICE_MAX_CHARS + 500)).length,
    ).toBeLessThanOrEqual(ADVISOR_ADVICE_MAX_CHARS);
  });

  test("keeps image metadata but omits image payloads from the prompt", () => {
    const prompt = buildAdvisorPrompt({
      conversation: {
        ...createConversation(),
        contextParts: [
          {
            type: "image_context",
            label: "settings screenshot",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,secret-payload",
          },
        ],
      },
    });

    expect(prompt).toContain("label: settings screenshot");
    expect(prompt).toContain("type: image/png");
    expect(prompt).not.toContain("secret-payload");
  });

  test("keeps instructions and current input when large context is truncated", () => {
    const currentInput = "keep-this-current-user-request";
    const prompt = buildAdvisorPrompt({
      conversation: {
        ...createConversation(currentInput),
        contextParts: [
          {
            type: "file_context",
            filePath: "large-context.ts",
            language: "typescript",
            content: "x".repeat(ADVISOR_PROMPT_MAX_CHARS * 2),
          },
        ],
      },
    });

    expect(prompt.length).toBeLessThanOrEqual(ADVISOR_PROMPT_MAX_CHARS);
    expect(prompt).toStartWith("You are a read-only Advisor");
    expect(prompt).toContain("[Context truncated]");
    expect(prompt).toContain(currentInput);
  });

  test("clears the target before the primary provider starts", () => {
    expect(
      withoutAdvisorTarget({
        model: "gpt-5.6-terra",
        advisorTarget: {
          providerId: "claude-code",
          model: "claude-fable-5",
        },
      }),
    ).toEqual({ model: "gpt-5.6-terra" });
  });
});
