import { describe, expect, test } from "bun:test";
import {
  classifyUtilityRoute,
  suggestUtilityCommitMessage,
  suggestUtilityTaskName,
  type UtilityInferenceRunners,
} from "../electron/providers/utility-inference";

function createRunners(args: {
  claude?: string | Error;
  codex?: string | Error;
  calls: string[];
}): UtilityInferenceRunners {
  const run = async (
    providerId: "claude-code" | "codex",
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
  };
}

describe("provider-neutral utility inference", () => {
  test("uses Claude when only Claude is available", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", activeProviderId: "claude-code" },
      createRunners({ calls, claude: "Fix Terminal Restore" }),
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Fix Terminal Restore");
    expect(result.utility.providerId).toBe("claude-code");
    expect(calls).toEqual(["claude-code"]);
  });

  test("uses Codex when only Codex is available", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", activeProviderId: "codex" },
      createRunners({ calls, codex: "Fix Terminal Restore" }),
    );

    expect(result.ok).toBe(true);
    expect(result.utility.providerId).toBe("codex");
    expect(calls).toEqual(["codex"]);
  });

  test("honors an explicit provider before the active task provider", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      {
        prompt: "fix the terminal",
        utilityProviderId: "codex",
        activeProviderId: "claude-code",
      },
      createRunners({
        calls,
        claude: "Claude Title",
        codex: "Codex Title",
      }),
    );

    expect(result.title).toBe("Codex Title");
    expect(result.utility.selectionReason).toBe("explicit");
    expect(calls).toEqual(["codex"]);
  });

  test("falls back once and reports the effective provider", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal", activeProviderId: "claude-code" },
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

  test("returns diagnostic attempts when neither provider is available", async () => {
    const calls: string[] = [];
    const result = await suggestUtilityTaskName(
      { prompt: "fix the terminal" },
      createRunners({ calls }),
    );

    expect(result.ok).toBe(false);
    expect(result.utility.providerId).toBeNull();
    expect(result.utility.attempts).toHaveLength(2);
    expect(calls).toEqual(["claude-code", "codex"]);
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
        selectionReason: "active-task",
      },
    });
    expect(calls).toEqual(["codex"]);
  });
});
