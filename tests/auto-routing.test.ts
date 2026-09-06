import { describe, expect, test } from "bun:test";
import { CLAUDE_FABLE_MODEL } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  resolveAutoRoutingDecision,
  resolveProviderStickiness,
  type AutoRoutingSettings,
} from "@/store/auto-routing";

const AUTO_SETTINGS: AutoRoutingSettings = {
  autoRoutingEnabled: true,
  autoRoutingUseClassifier: false,
  autoRoutingObjective: 0.5,
  autoRoutingSafetyEscalation: true,
  autoRoutingAllowProviderSwitch: false,
  autoRoutingEligibleClaudeModels: [],
  autoRoutingEligibleCodexModels: [],
};

function resolveDecision(args: {
  prompt: string;
  settings?: Partial<AutoRoutingSettings>;
  currentProviderId?: ProviderId;
  currentModel?: string;
  history?: Parameters<typeof resolveAutoRoutingDecision>[0]["history"];
  fileContextCount?: number;
  runtimeOverrides?: Parameters<
    typeof resolveAutoRoutingDecision
  >[0]["runtimeOverrides"];
  classifyRoute?: Parameters<
    typeof resolveAutoRoutingDecision
  >[0]["classifyRoute"];
  classifierTimeoutMs?: number;
}) {
  return resolveAutoRoutingDecision({
    settings: {
      ...AUTO_SETTINGS,
      ...(args.settings ?? {}),
    },
    runtimeOverrides: args.runtimeOverrides ?? { autoRouting: true },
    currentProviderId: args.currentProviderId ?? "claude-code",
    currentModel: args.currentModel ?? "claude-sonnet-5",
    prompt: args.prompt,
    history: args.history ?? [],
    fileContextCount: args.fileContextCount,
    classifyRoute: args.classifyRoute,
    classifierTimeoutMs: args.classifierTimeoutMs,
  });
}

describe("resolveAutoRoutingDecision", () => {
  test("short prompts route to the light Claude model on the first turn", async () => {
    const decision = await resolveDecision({ prompt: "fix typo" });

    expect(decision).toMatchObject({
      providerId: "claude-code",
      model: "claude-haiku-4-5",
      taskType: "quick_edit",
      tier: "light",
      source: "heuristic",
    });
  });

  test("planning prompts route to the heavy Claude tier", async () => {
    const decision = await resolveDecision({
      prompt: "Plan the implementation sequence for this refactor",
    });

    expect(decision).toMatchObject({
      providerId: "claude-code",
      model: "claude-sonnet-5",
      taskType: "plan",
      tier: "heavy",
    });
  });

  test("file context increases tier but caps file-only pressure at heavy", async () => {
    const decision = await resolveDecision({
      prompt: "Implement the requested change",
      fileContextCount: 6,
    });

    expect(decision.tier).toBe("heavy");
    expect(decision.model).toBe("claude-sonnet-5");
  });

  test("safety escalation lifts sensitive requests to heavy", async () => {
    const decision = await resolveDecision({
      prompt: "Update auth token handling",
    });

    expect(decision.taskType).toBe("safety");
    expect(decision.tier).toBe("heavy");
  });

  test("objective extremes shift tier down or up", async () => {
    const lowCost = await resolveDecision({
      prompt: "Plan the implementation sequence",
      settings: { autoRoutingObjective: 0 },
    });
    const highQuality = await resolveDecision({
      prompt: "Plan the implementation sequence",
      settings: { autoRoutingObjective: 1 },
    });

    expect(lowCost.tier).toBe("standard");
    expect(lowCost.model).toBe("claude-sonnet-5");
    expect(highQuality.tier).toBe("frontier");
    expect(highQuality.model).toBe(CLAUDE_FABLE_MODEL);
  });

  test("honors a single eligible provider model", async () => {
    const decision = await resolveDecision({
      prompt: "Plan the implementation sequence",
      settings: {
        autoRoutingEligibleClaudeModels: ["claude-haiku-4-5"],
      },
    });

    expect(decision.model).toBe("claude-haiku-4-5");
  });

  test("keeps Codex fixed inside an existing Codex conversation", async () => {
    const decision = await resolveDecision({
      prompt: "Implement the follow-up fix",
      currentProviderId: "codex",
      currentModel: "gpt-5.4",
      history: [
        {
          role: "assistant",
          content: "Previous Codex response",
          providerId: "codex",
          model: "gpt-5.4",
        },
      ],
    });

    expect(decision.providerId).toBe("codex");
  });

  test("falls back to heuristics when the classifier times out", async () => {
    const decision = await resolveDecision({
      prompt:
        "I am not sure how to approach this area in the codebase yet and need guidance",
      settings: { autoRoutingUseClassifier: true },
      classifierTimeoutMs: 1,
      classifyRoute: () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                taskType: "plan",
                complexity: "high",
                recommendedTier: "frontier",
                confidence: 0.95,
              }),
            20,
          );
        }),
    });

    expect(decision.source).toBe("classifier_fallback");
    expect(decision.model).toBe("claude-sonnet-5");
  });

  test("manual model override short-circuits auto routing", async () => {
    const decision = await resolveDecision({
      prompt: "Plan the implementation",
      runtimeOverrides: {
        autoRouting: true,
        model: "gpt-5.5",
      },
    });

    expect(decision).toMatchObject({
      source: "manual",
      providerId: "codex",
      model: "gpt-5.5",
    });
  });

  test("a manual model retains task-local effort instead of resetting to the model default", async () => {
    const codex = await resolveDecision({
      prompt: "Inspect the changes",
      runtimeOverrides: { model: "gpt-5.5", modelProviderId: "codex", codexReasoningEffort: "low" },
    });
    expect(codex.codexReasoningEffort).toBe("low");
    const claude = await resolveDecision({
      prompt: "Inspect the changes",
      runtimeOverrides: { model: "claude-sonnet-5", modelProviderId: "claude-code", claudeEffort: "high" },
    });
    expect(claude.claudeEffort).toBe("high");
  });

  test("disabled auto routing preserves the current provider and model", async () => {
    const decision = await resolveDecision({
      prompt: "Plan the implementation",
      currentProviderId: "codex",
      currentModel: "gpt-5.4",
      settings: { autoRoutingEnabled: false },
    });

    expect(decision).toMatchObject({
      source: "disabled",
      providerId: "codex",
      model: "gpt-5.4",
    });
  });
});

describe("resolveProviderStickiness", () => {
  test("uses Claude as the first-turn fallback provider", () => {
    expect(
      resolveProviderStickiness({
        currentProviderId: "codex",
        history: [],
        allowProviderSwitch: false,
      }),
    ).toBe("claude-code");
  });

  test("requires three assistant turns before provider switching unpins", () => {
    expect(
      resolveProviderStickiness({
        currentProviderId: "claude-code",
        history: [
          { role: "assistant", content: "one", providerId: "claude-code" },
          { role: "assistant", content: "two", providerId: "claude-code" },
        ],
        allowProviderSwitch: true,
        suggestedProviderId: "codex",
      }),
    ).toBe("claude-code");

    expect(
      resolveProviderStickiness({
        currentProviderId: "claude-code",
        history: [
          { role: "assistant", content: "one", providerId: "claude-code" },
          { role: "assistant", content: "two", providerId: "claude-code" },
          { role: "assistant", content: "three", providerId: "claude-code" },
        ],
        allowProviderSwitch: true,
        suggestedProviderId: "codex",
      }),
    ).toBe("codex");
  });
});
