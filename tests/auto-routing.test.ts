import { describe, expect, test } from "bun:test";
import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  detectPromptSkill,
  formatAutoRoutingSignalSummary,
  buildAutoRoutingDecisionRecord,
  resolveAutoRoutingDecision,
  resolveHeuristicRoute,
  resolveProviderStickiness,
  type AutoRoutingSettings,
} from "@/store/auto-routing";
import { isAutoRoutingUnavailableForSend } from "@/store/auto-routing-dispatch";

const AUTO_SETTINGS: AutoRoutingSettings = {
  autoRoutingEnabled: true,
  autoRoutingUseClassifier: false,
  autoRoutingObjective: 0.5,
  autoRoutingSafetyEscalation: true,
  autoRoutingAllowProviderSwitch: false,
  autoRoutingEligibleClaudeModels: [],
  autoRoutingEligibleCodexModels: [],
};

describe("Auto routing send availability", () => {
  const autoDraft = {
    text: "Route this",
    attachedFilePaths: [],
    attachments: [],
    runtimeOverrides: { autoRouting: true },
  };

  test("blocks new and queued Auto turns while the setting is off", () => {
    expect(
      isAutoRoutingUnavailableForSend({
        promptDraft: autoDraft,
        autoRoutingEnabled: false,
        steeringActiveTurn: false,
      }),
    ).toBe(true);
  });

  test("lets a steer continue on its already-running provider", () => {
    expect(
      isAutoRoutingUnavailableForSend({
        promptDraft: autoDraft,
        autoRoutingEnabled: false,
        steeringActiveTurn: true,
      }),
    ).toBe(false);
  });
});

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
  test("short prompts stay on the flagship at medium effort on the first turn", async () => {
    const decision = await resolveDecision({ prompt: "fix typo" });

    // Quick edits share the implement model so the prompt cache survives;
    // only the effort drops.
    expect(decision).toMatchObject({
      providerId: "claude-code",
      model: DEFAULT_CLAUDE_OPUS_MODEL,
      claudeEffort: "medium",
      taskType: "quick_edit",
      taskClass: "quick-edit",
      // Catalog tier, not the router rung: Opus 5 sits in the frontier group.
      tier: "frontier",
      source: "heuristic",
      ruleId: "quick-edit",
      role: "primary",
      stance: "balanced",
    });
    expect(decision.ruleReason.length).toBeGreaterThan(0);
  });

  test("planning prompts route to the frontier model", async () => {
    const decision = await resolveDecision({
      prompt: "Plan the implementation sequence for this refactor",
    });

    expect(decision).toMatchObject({
      providerId: "claude-code",
      model: CLAUDE_FABLE_MODEL,
      taskType: "plan",
      taskClass: "plan",
      ruleId: "plan",
      claudeEffort: "medium",
    });
  });

  test("implementation with heavy file context runs on the flagship at xhigh effort", async () => {
    const decision = await resolveDecision({
      prompt: "Implement the requested change",
      fileContextCount: 6,
    });

    // Heavy file context reads as high complexity, which moves effort up a
    // step on the same flagship model rather than changing the model.
    expect(decision.model).toBe(DEFAULT_CLAUDE_OPUS_MODEL);
    expect(decision.claudeEffort).toBe("xhigh");
    expect(decision.ruleId).toBe("implement-deep");
    expect(decision.signals).toMatchObject({
      taskClass: "implement",
      complexity: "high",
      fileContextCount: 6,
    });
  });

  test("safety escalation lifts sensitive requests to the frontier", async () => {
    const decision = await resolveDecision({
      prompt: "Update auth token handling",
    });

    expect(decision.taskType).toBe("safety");
    expect(decision.taskClass).toBe("safety-critical");
    expect(decision.ruleId).toBe("safety-critical");
    expect(decision.model).toBe(CLAUDE_FABLE_MODEL);
    expect(decision.signals.sensitive).toBe(true);
  });

  test("the legacy objective maps to a stance that shifts the route", async () => {
    const lowCost = await resolveDecision({
      prompt: "Plan the implementation sequence",
      settings: { autoRoutingObjective: 0 },
    });
    const highQuality = await resolveDecision({
      prompt: "Plan the implementation sequence",
      settings: { autoRoutingObjective: 1 },
    });

    expect(lowCost.stance).toBe("cost-saver");
    expect(lowCost.model).toBe(DEFAULT_CLAUDE_OPUS_MODEL);
    expect(highQuality.stance).toBe("quality-first");
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

  test("treats writing a regression test as implementation, not debugging", async () => {
    const decision = await resolveDecision({
      prompt:
        "Add a regression test for duplicate close requests in the terminal host and make it pass.",
      fileContextCount: 3,
    });
    expect(decision.taskType).toBe("implementation");
    expect(decision.taskClass).toBe("implement");

    const regression = await resolveDecision({
      prompt: "There is a regression in the terminal host close ordering since yesterday.",
    });
    expect(regression.taskType).toBe("debug");
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
    expect(decision.model).toBe("gpt-5.6-sol");
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
    expect(decision.model).toBe(DEFAULT_CLAUDE_OPUS_MODEL);
  });

  test("a classifier verdict reclassifies the task before the table runs", async () => {
    const decision = await resolveDecision({
      prompt:
        "I am not sure how to approach this area in the codebase yet and need guidance",
      settings: { autoRoutingUseClassifier: true },
      classifyRoute: async () => ({
        taskType: "plan",
        complexity: "high",
        recommendedTier: "frontier",
        confidence: 0.95,
      }),
    });

    expect(decision.source).toBe("classifier");
    expect(decision.taskClass).toBe("plan");
    expect(decision.model).toBe(CLAUDE_FABLE_MODEL);
  });

  test("slash skills route through skill rules", async () => {
    const decision = await resolveDecision({
      prompt: "/ship the current branch with a conventional commit message",
    });

    expect(decision.signals.skill).toBe("ship");
    expect(decision.ruleId).toBe("skill-ship");
    expect(decision.model).toBe("claude-haiku-4-5");
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
      ruleId: null,
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

describe("signals", () => {
  test("detectPromptSkill reads a leading slash command only", () => {
    expect(detectPromptSkill("/ci-fix the workflow")).toBe("ci-fix");
    expect(detectPromptSkill("  /Review:pr")).toBe("review:pr");
    expect(detectPromptSkill("please run /ship")).toBeUndefined();
    expect(detectPromptSkill("a/b path")).toBeUndefined();
  });

  test("heuristics classify CI, docs, and research prompts", () => {
    expect(
      resolveHeuristicRoute({
        prompt: "The CI pipeline is failing on lint",
        fileContextCount: 0,
        safetyEscalation: true,
      }).taskClass,
    ).toBe("ci-fix");
    expect(
      resolveHeuristicRoute({
        prompt: "Rewrite the README documentation for the new setup flow",
        fileContextCount: 0,
        safetyEscalation: true,
      }).taskClass,
    ).toBe("docs");
    expect(
      resolveHeuristicRoute({
        prompt: "Explain how does the workspace snapshot flush pipeline decide when to write",
        fileContextCount: 0,
        safetyEscalation: true,
      }).taskClass,
    ).toBe("ci-fix");
    expect(
      resolveHeuristicRoute({
        prompt: "Investigate how the theme presets are loaded and summarize the differences between them",
        fileContextCount: 0,
        safetyEscalation: true,
      }).taskClass,
    ).toBe("research");
  });

  test("formatAutoRoutingSignalSummary renders the tooltip line", () => {
    expect(
      formatAutoRoutingSignalSummary({
        taskClass: "implement",
        complexity: "medium",
        sensitive: false,
        fileContextCount: 3,
        budgetUsedPercent: 41,
      }),
    ).toBe("implement · medium complexity · 3 files · budget 41%");
  });

  test("decision records keep a bounded prompt preview", async () => {
    const decision = await resolveDecision({ prompt: "fix typo" });
    const record = buildAutoRoutingDecisionRecord({
      decision,
      prompt: `${"word ".repeat(60)}`,
      resolvedAt: "2026-09-14T00:00:00.000Z",
    });
    expect(record.promptPreview.length).toBeLessThanOrEqual(120);
    expect(record.promptPreview.endsWith("…")).toBe(true);
    expect(record.resolvedAt).toBe("2026-09-14T00:00:00.000Z");
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
