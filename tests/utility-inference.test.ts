import { describe, expect, test } from "bun:test";
import {
  buildUtilityCodexRuntimeOptions,
  classifyUtilityRoute,
  enhanceUtilityPrompt,
  resolveUtilityInferenceCandidates,
  suggestUtilityCommitMessage,
  suggestUtilityTaskName,
  type UtilityInferenceAuthGate,
  type UtilityInferenceRunners,
} from "../electron/providers/utility-inference";
import {
  UTILITY_CODEX_FAST_MODE,
  UTILITY_CODEX_REASONING_EFFORT,
  parseRouteClassification,
} from "../src/lib/providers/utility-inference";

function createRunners(args: {
  claude?: string | Error;
  codex?: string | Error;
  cursor?: string | Error;
  kiro?: string | Error;
  calls: string[];
}): UtilityInferenceRunners {
  const run = async (
    providerId: "claude-code" | "codex" | "cursor" | "kiro",
    value?: string | Error,
  ) => {
    args.calls.push(providerId);
    if (value instanceof Error) {
      throw value;
    }
    return value
      ? { ok: true, text: value }
      : { ok: false, detail: `${providerId} unavailable` };
  };
  return {
    "claude-code": () => run("claude-code", args.claude),
    codex: () => run("codex", args.codex),
    cursor: () => run("cursor", args.cursor),
    kiro: () => run("kiro", args.kiro),
  };
}

function createAuthGate(
  ready: Partial<Record<"claude-code" | "codex" | "cursor" | "kiro", boolean>>,
): UtilityInferenceAuthGate {
  return async ({ providerId }) => ({
    ready: ready[providerId] !== false,
    detail:
      ready[providerId] === false
        ? `${providerId} is not authenticated.`
        : undefined,
  });
}

describe("resolveUtilityInferenceCandidates", () => {
  test("prefers Codex Luna, then Claude Haiku, then Cursor and Kiro", () => {
    expect(
      resolveUtilityInferenceCandidates({
        activeProviderId: "claude-code",
      }).map((candidate) => candidate.providerId),
    ).toEqual(["codex", "claude-code", "cursor", "kiro"]);
  });

  test("does not let the active task jump the Auto order", () => {
    const candidates = resolveUtilityInferenceCandidates({
      activeProviderId: "claude-code",
    });
    expect(
      candidates.find((candidate) => candidate.reason === "active-task"),
    ).toBe(undefined);
    expect(candidates[0]).toEqual({ providerId: "codex", reason: "fallback" });
  });

  test("honors an explicit Utility AI pin before Auto order", () => {
    expect(
      resolveUtilityInferenceCandidates({
        utilityProviderId: "claude-code",
        activeProviderId: "codex",
      }).map((candidate) => ({
        providerId: candidate.providerId,
        reason: candidate.reason,
      })),
    ).toEqual([
      { providerId: "claude-code", reason: "explicit" },
      { providerId: "codex", reason: "fallback" },
      { providerId: "cursor", reason: "fallback" },
      { providerId: "kiro", reason: "fallback" },
    ]);
  });
});

describe("buildUtilityCodexRuntimeOptions", () => {
  test("uses medium effort and fast mode for Luna utility calls", () => {
    expect(
      buildUtilityCodexRuntimeOptions({
        model: "gpt-5.6-luna",
        runtimeOptions: {
          model: "gpt-5.6-terra",
          codexReasoningEffort: "xhigh",
          codexFastMode: false,
        },
      }),
    ).toMatchObject({
      model: "gpt-5.6-luna",
      codexReasoningEffort: UTILITY_CODEX_REASONING_EFFORT,
      codexFastMode: UTILITY_CODEX_FAST_MODE,
      codexApprovalPolicy: "never",
      codexFileAccess: "read-only",
      codexNetworkAccess: false,
      codexWebSearch: "disabled",
    });
    expect(UTILITY_CODEX_REASONING_EFFORT).toBe("medium");
    expect(UTILITY_CODEX_FAST_MODE).toBe(true);
  });
});

describe("parseRouteClassification", () => {
  test("parses strict route classification JSON", () => {
    expect(
      parseRouteClassification(
        '{"taskType":"plan","complexity":"high","recommendedTier":"heavy","confidence":0.82,"rationale":"planning","stick":false}',
      ),
    ).toEqual({
      taskType: "plan",
      complexity: "high",
      recommendedTier: "heavy",
      confidence: 0.82,
      rationale: "planning",
      stick: false,
    });
  });

  test("returns null for malformed route classification JSON", () => {
    expect(parseRouteClassification("not json")).toBeNull();
    expect(
      parseRouteClassification(
        '{"taskType":"unknown","complexity":"high","recommendedTier":"heavy","confidence":0.82}',
      ),
    ).toBeNull();
  });
});

describe("provider-neutral utility inference", () => {
  test("uses Codex first when it is available", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", activeProviderId: "claude-code" },
      createRunners({ calls, claude: "Claude Title", codex: "Codex Title" }),
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Codex Title");
    expect(result.utility.providerId).toBe("codex");
    expect(calls).toEqual(["codex"]);
  });

  test("falls back to Claude when Codex is unavailable", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", activeProviderId: "claude-code" },
      createRunners({ calls, claude: "Fix Terminal Restore" }),
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Fix Terminal Restore");
    expect(result.utility).toMatchObject({
      providerId: "claude-code",
      selectionReason: "fallback",
      degraded: true,
    });
    expect(calls).toEqual(["codex", "claude-code"]);
  });

  test("honors an explicit provider before Auto order", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      {
        prompt: "fix the terminal",
        utilityProviderId: "claude-code",
        activeProviderId: "codex",
      },
      createRunners({
        calls,
        claude: "Claude Title",
        codex: "Codex Title",
      }),
    );

    expect(result.title).toBe("Claude Title");
    expect(result.utility.selectionReason).toBe("explicit");
    expect(calls).toEqual(["claude-code"]);
  });

  test("falls back once and reports the effective provider", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      {
        prompt: "fix the terminal",
        utilityProviderId: "claude-code",
      },
      createRunners({
        calls,
        claude: new Error("not signed in"),
        codex: "Codex Fallback Title",
      }),
    );

    expect(result.title).toBe("Codex Fallback Title");
    expect(result.utility).toMatchObject({
      providerId: "codex",
      selectionReason: "fallback",
      degraded: true,
    });
    expect(calls).toEqual(["claude-code", "codex"]);
  });

  test("skips unauthenticated fallbacks", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", utilityMaxProviderAttempts: 4 },
      createRunners({
        calls,
        claude: "Claude Title",
        kiro: "Kiro Title",
      }),
      createAuthGate({
        "claude-code": false,
        cursor: false,
        kiro: true,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      title: "Kiro Title",
      utility: {
        providerId: "kiro",
        selectionReason: "fallback",
        degraded: true,
      },
    });
    expect(calls).toEqual(["codex", "kiro"]);
    expect(result.utility.attempts.map((attempt) => attempt.detail)).toEqual([
      "codex unavailable",
      "claude-code is not authenticated.",
      "cursor is not authenticated.",
      undefined,
    ]);
  });

  test("uses Cursor as a last-resort compatibility runner", async () => {
    const calls: string[] = [];
    const result = await enhanceUtilityPrompt(
      {
        prompt: "fix terminal bug tests too",
        activeProviderId: "cursor",
        utilityMaxProviderAttempts: 4,
      },
      createRunners({
        calls,
        cursor: "Fix the terminal bug and add regression coverage.",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      prompt: "Fix the terminal bug and add regression coverage.",
      utility: {
        providerId: "cursor",
        selectionReason: "fallback",
        degraded: true,
      },
    });
    expect(calls).toEqual(["codex", "claude-code", "cursor"]);
  });

  test("returns diagnostic attempts when no runner is available", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", utilityMaxProviderAttempts: 4 },
      createRunners({ calls }),
    );

    expect(result.ok).toBe(false);
    expect(result.utility.providerId).toBeNull();
    expect(result.utility.attempts).toHaveLength(4);
    expect(calls).toEqual(["codex", "claude-code", "cursor", "kiro"]);
  });

  test("caps executed runs, not candidates, so an uninstalled provider costs no budget", async () => {
    const calls: string[] = [];

    // Two managed providers that both run and both fail to parse: the cap
    // stops there instead of fanning out over the last-resort runners.
    const capped = await suggestUtilityTaskName(
      { prompt: "fix the terminal" },
      createRunners({ calls, kiro: "Kiro Title" }),
    );
    expect(calls).toEqual(["codex", "claude-code"]);
    expect(capped.ok).toBe(false);

    // The same default cap, but the managed providers are not authenticated.
    // Those skips cost no model call, so the budget still reaches Kiro —
    // otherwise a Kiro-only install would lose task naming entirely.
    const kiroOnly: string[] = [];
    const reached = await suggestUtilityTaskName(
      { prompt: "fix the terminal" },
      createRunners({ calls: kiroOnly, kiro: "Kiro Title" }),
      createAuthGate({ "claude-code": false, cursor: false, kiro: true }),
    );
    expect(reached).toMatchObject({ ok: true, title: "Kiro Title" });
    expect(kiroOnly).toEqual(["codex", "kiro"]);
  });

  test("applies a configured utility model only to the provider that owns it", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      {
        prompt: "fix the terminal",
        utilityProviderId: "claude-code",
        utilityModel: "claude-haiku-4-5",
      },
      createRunners({ calls, codex: "Codex Title" }),
    );

    expect(result.utility.attempts[0]).toMatchObject({
      providerId: "claude-code",
      model: "claude-haiku-4-5",
    });
    // A different runner gets its own default: forcing another provider's
    // model id onto it would fail the call outright.
    expect(result.utility.attempts[1]).toMatchObject({
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
  });

  test("honors a configured model under the default Auto provider setting", async () => {
    // `utilityInferenceProvider` defaults to "auto", so every candidate is a
    // fallback. Keying off the model's own provider is what keeps the user's
    // Background AI model choice from being silently ignored on a default
    // install.
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", utilityModel: "gpt-5.6-luna" },
      createRunners({ calls, codex: "Codex Title" }),
    );

    expect(result).toMatchObject({ ok: true, title: "Codex Title" });
    expect(result.utility).toMatchObject({
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
  });

  test("parses route classification through the same provider selection", async () => {
    const calls: string[] = [];
    const result = await classifyUtilityRoute(
      { prompt: "review this patch", activeProviderId: "codex" },
      createRunners({
        calls,
        codex:
          '{"taskType":"review","complexity":"medium","recommendedTier":"standard","confidence":0.9}',
      }),
    );

    expect(result.classification).toMatchObject({
      taskType: "review",
      complexity: "medium",
      recommendedTier: "standard",
      confidence: 0.9,
    });
    expect(result.utility.providerId).toBe("codex");
  });

  test("uses the same provider selection for commit messages", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityCommitMessage(
      {
        diff: "diff --git a/src/a.ts b/src/a.ts",
        fileList: "M src/a.ts",
        activeProviderId: "codex",
      },
      createRunners({
        calls,
        codex: "refactor(provider): unify utility inference",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      message: "refactor(provider): unify utility inference",
      utility: {
        providerId: "codex",
        selectionReason: "fallback",
      },
    });
    expect(calls).toEqual(["codex"]);
  });

  test("rewrites prompts through the isolated utility provider", async () => {
    const calls: string[] = [];
    const result = await enhanceUtilityPrompt(
      {
        prompt: "fix terminal bug tests too",
        activeProviderId: "codex",
      },
      createRunners({
        calls,
        codex:
          "```text\nFix the terminal bug and add regression coverage for the affected behavior.\n```",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      prompt:
        "Fix the terminal bug and add regression coverage for the affected behavior.",
      utility: {
        providerId: "codex",
        selectionReason: "fallback",
      },
    });
    expect(calls).toEqual(["codex"]);
  });
});
