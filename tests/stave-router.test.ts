import { describe, expect, test } from "bun:test";
import {
  buildStaveResolvedArgs,
  resolveForcedStavePlanTarget,
  resolveSkillFastPath,
  resolveStaveTarget,
} from "../electron/providers/stave-router";
import type { StreamTurnArgs } from "../electron/providers/types";
import type { CanonicalConversationRequest } from "../src/lib/providers/provider.types";
import type { SkillPromptContext } from "../src/lib/skills/types";
import { DEFAULT_STAVE_AUTO_PROFILE } from "../src/lib/providers/stave-auto-profile";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Repeat a string until it reaches at least `length` characters. */
function padTo(base: string, length: number): string {
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

function minimalArgs(overrides: Partial<StreamTurnArgs> = {}): StreamTurnArgs {
  return {
    providerId: "stave",
    prompt: "hello",
    cwd: "/tmp/workspace",
    ...overrides,
  };
}

// ── resolveStaveTarget ────────────────────────────────────────────────────────

describe("resolveStaveTarget", () => {
  // ── Rule 1: planning intent → opusplan ──────────────────────────────────

  describe("Rule 1 — planning intent → opusplan", () => {
    test("routes '계획' keyword to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "이 기능 어떻게 구현할 계획을 세워줘",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("routes '설계' keyword to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "새로운 모듈 설계 방향을 잡아줘",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("routes '전략' keyword to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "마이그레이션 전략을 어떻게 잡을까?",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("routes 'approach' keyword to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "What's the best approach to add OAuth to this app?",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("routes 'how should I structure' to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "How should I structure the new payment module?",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("routes 'before implement' to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "Before I implement this feature, give me a plan.",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });

    test("does NOT route to opusplan when analysisScore > 0 (mixed intent)", () => {
      // Has both 'plan' and 'analyze' → falls through to rules 2–6
      const result = resolveStaveTarget({
        prompt: "Analyze the codebase and give me a refactoring plan",
      });
      expect(result.model).not.toBe("opusplan");
    });

    test("does NOT route to opusplan for a 3-char-or-shorter prompt", () => {
      // len > 3 guard prevents accidental single-char / blank matches
      const result = resolveStaveTarget({ prompt: "pl" });
      expect(result.model).not.toBe("opusplan");
    });

    test("routes a short 'plan' keyword prompt to opusplan", () => {
      // "plan" (4 chars) exceeds the len > 3 guard and should route
      const result = resolveStaveTarget({ prompt: "plan" });
      expect(result.model).toBe("opusplan");
    });

    test("routes '어떻게 할까' to opusplan", () => {
      const result = resolveStaveTarget({
        prompt: "이 버그 어떻게할까 좋은 방향을 알려줘",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("opusplan");
    });
  });

  // ── Rule 2: OpenAI keywords follow normal intent rules ──────────────────

  describe("Rule 2 — OpenAI keywords follow normal intent rules", () => {
    test("treats OpenAI API questions as general requests by default", () => {
      const result = resolveStaveTarget({
        prompt: "How do I call the OpenAI chat API?",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-sonnet-4-6");
    });

    test("still routes implementation prompts about OpenAI to the implement model", () => {
      const result = resolveStaveTarget({
        prompt: "Write code that calls o3-mini for embeddings",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("lets quick-edit heuristics win when the prompt is a tiny OpenAI rename", () => {
      const result = resolveStaveTarget({
        prompt: "Just rename the openai client variable",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });
  });

  // ── Rule 3: analysis / planning → claude-opus-4-7 ──────────────────────

  describe("Rule 3 — analysis/planning → claude-opus-4-7", () => {
    test("routes long analysis prompt (> 1200 chars) to claude-opus-4-7", () => {
      const longPrompt = padTo(
        "Explain how the authentication system works. ",
        1201,
      );
      const result = resolveStaveTarget({ prompt: longPrompt });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes analysis prompt with 4+ attached files to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "Analyze all these files and summarize what they do",
        attachedFileCount: 4,
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes analysis prompt with 8+ history messages to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "Why does this module keep crashing?",
        historyLength: 8,
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes mixed plan+analysis complex prompt to claude-opus-4-7 (not opusplan)", () => {
      const longPrompt = padTo(
        "Analyze the codebase and give me a refactoring plan. ",
        1201,
      );
      const result = resolveStaveTarget({ prompt: longPrompt });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes '분석' keyword with large context to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "이 코드베이스 전체를 분석해줘",
        attachedFileCount: 5,
      });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes short analysis prompt to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "Why is this function slow?",
      });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes short Korean review prompt to claude-opus-4-7", () => {
      const result = resolveStaveTarget({ prompt: "리뷰해" });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });
  });

  // ── Rule 4: precise code generation → gpt-5.3-codex ────────────────────

  describe("Rule 4 — precise code generation → gpt-5.3-codex", () => {
    test("routes 'write a function' to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Write a function to validate email addresses",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("routes 'generate code' to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Generate code for a binary search tree",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("routes 'implement a function' to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Implement a function to debounce API calls",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("routes 'implement an algorithm' to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Implement an algorithm for topological sort",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("routes 'write a class' to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Write a class for managing user sessions",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("keeps long code-gen prompts on gpt-5.3-codex", () => {
      // implement intent is not gated by the short-prompt threshold
      const longPrompt = padTo("Write a function that sorts arrays. ", 350);
      const result = resolveStaveTarget({ prompt: longPrompt });
      expect(result.model).toBe("gpt-5.3-codex");
    });

    test("routes test-writing requests to gpt-5.3-codex", () => {
      const result = resolveStaveTarget({
        prompt: "Write unit tests for the UserService class",
      });
      expect(result.providerId).toBe("codex");
      expect(result.model).toBe("gpt-5.3-codex");
    });
  });

  // ── Rule 5: quick targeted edit → claude-haiku-4-5 ──────────────────────

  describe("Rule 5 — quick targeted edit → claude-haiku-4-5", () => {
    test("routes 'typo' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({ prompt: "Fix the typo on line 23" });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes 'rename' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({
        prompt: "Rename getUserById to findUserById",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes 'just fix' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({
        prompt: "Just fix the missing semicolon",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes 'quick fix' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({
        prompt: "Quick fix: remove the extra import",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes '오타' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({ prompt: "오타 수정해줘" });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes '간단하게' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({ prompt: "간단하게 변수명 바꿔줘" });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("routes '이름 변경' keyword to claude-haiku-4-5", () => {
      const result = resolveStaveTarget({
        prompt: "이름 변경: userId → accountId",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-haiku-4-5");
    });

    test("does NOT route long quick-edit prompt (>= 350 chars) to haiku", () => {
      const longPrompt = padTo("Just fix this variable. ", 350);
      const result = resolveStaveTarget({ prompt: longPrompt });
      expect(result.model).not.toBe("claude-haiku-4-5");
    });
  });

  // ── Rule 6: default → claude-sonnet-4-6 ─────────────────────────────────

  describe("Rule 6 — default → claude-sonnet-4-6", () => {
    test("routes generic implementation request to claude-sonnet-4-6", () => {
      const result = resolveStaveTarget({
        prompt: "Add error handling to the fetchUser function",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-sonnet-4-6");
    });

    test("routes debugging request to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "Debug the login flow for me",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes code review request to claude-opus-4-7", () => {
      const result = resolveStaveTarget({
        prompt: "Review this PR and give me feedback",
      });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("routes empty prompt to claude-sonnet-4-6", () => {
      const result = resolveStaveTarget({ prompt: "" });
      expect(result.providerId).toBe("claude-code");
      expect(result.model).toBe("claude-sonnet-4-6");
    });
  });

  // ── Complexity signal thresholds ─────────────────────────────────────────

  describe("complexity signal thresholds", () => {
    test("prompt exactly 1200 chars still routes analysis prompts to opus", () => {
      const prompt = padTo("Explain why this function is slow. ", 1200);
      const result = resolveStaveTarget({ prompt });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("prompt exactly 1201 chars IS complex", () => {
      const prompt = padTo("Explain why this function is slow. ", 1201);
      const result = resolveStaveTarget({ prompt });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("3 attached files still route analysis prompts to opus", () => {
      const result = resolveStaveTarget({
        prompt: "Analyze these files",
        attachedFileCount: 3,
      });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("4 attached files IS complex", () => {
      const result = resolveStaveTarget({
        prompt: "Analyze these files",
        attachedFileCount: 4,
      });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("7 history messages still route analysis prompts to opus", () => {
      const result = resolveStaveTarget({
        prompt: "Why does this crash?",
        historyLength: 7,
      });
      expect(result.model).toBe("claude-opus-4-7");
    });

    test("8 history messages IS complex", () => {
      const result = resolveStaveTarget({
        prompt: "Why does this crash?",
        historyLength: 8,
      });
      expect(result.model).toBe("claude-opus-4-7");
    });
  });

  // ── isShort boundary ─────────────────────────────────────────────────────

  describe("isShort boundary (< 350 chars)", () => {
    test("prompt exactly 350 chars is NOT short (threshold is < 350)", () => {
      const prompt = padTo("Write a function for sorting. ", 350);
      // quick-edit is gated by length, but implement intent is not
      const result = resolveStaveTarget({ prompt });
      expect(result.model).toBe("gpt-5.3-codex");
      expect(result.model).not.toBe("claude-haiku-4-5");
    });

    test("prompt exactly 349 chars IS short", () => {
      const prompt = padTo("Write a function for sorting. ", 349);
      const result = resolveStaveTarget({ prompt });
      expect(result.model).toBe("gpt-5.3-codex");
    });
  });

  // ── reason field ─────────────────────────────────────────────────────────

  describe("reason field", () => {
    test("includes a non-empty reason for every routing decision", () => {
      const prompts = [
        "이 기능 어떻게 구현할 계획을 세워줘",
        "OpenAI API 연동 코드 짜줘",
        padTo("Explain the entire architecture. ", 1201),
        "Write a function to validate emails",
        "Just fix the typo",
        "Implement the new dashboard feature",
      ];
      for (const prompt of prompts) {
        const result = resolveStaveTarget({ prompt });
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });

    test("reason mentions the resolved model name", () => {
      const result = resolveStaveTarget({ prompt: "계획 세워줘" });
      // reason always contains the raw model id (e.g. "opusplan")
      expect(result.reason).toContain(result.model);
    });
  });
});

function customProfile(overrides: Partial<typeof DEFAULT_STAVE_AUTO_PROFILE>) {
  return {
    ...DEFAULT_STAVE_AUTO_PROFILE,
    ...overrides,
  };
}

// ── profile overrides ────────────────────────────────────────────────────────

describe("profile overrides", () => {
  test("overrides the planning intent model through the active profile", () => {
    const result = resolveStaveTarget({
      prompt: "이 기능 설계 방향 잡아줘",
      profile: customProfile({ planModel: "claude-opus-4-6" }),
    });
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.providerId).toBe("claude-code");
  });

  test("overrides the general intent model through the active profile", () => {
    const result = resolveStaveTarget({
      prompt: "How do I integrate the OpenAI API?",
      profile: customProfile({ generalModel: "gpt-5.4" }),
    });
    expect(result.model).toBe("gpt-5.4");
    expect(result.providerId).toBe("codex");
  });

  test("overrides the analyze intent model through the active profile", () => {
    const longPrompt = padTo("Analyze why the system is failing. ", 1201);
    const result = resolveStaveTarget({
      prompt: longPrompt,
      profile: customProfile({ analyzeModel: "gpt-5.4" }),
    });
    expect(result.model).toBe("gpt-5.4");
    expect(result.providerId).toBe("codex");
  });

  test("overrides the implement intent model through the active profile", () => {
    const result = resolveStaveTarget({
      prompt: "Write a function to parse CSV files",
      profile: customProfile({ implementModel: "claude-haiku-4-5" }),
    });
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.providerId).toBe("claude-code");
  });

  test("overrides the quick-edit intent model through the active profile", () => {
    const result = resolveStaveTarget({
      prompt: "Just fix the typo here",
      profile: customProfile({ quickEditModel: "claude-sonnet-4-6" }),
    });
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  test("partial profile overrides leave other intents on their defaults", () => {
    const result = resolveStaveTarget({
      prompt: "Just fix the typo here",
      profile: customProfile({ planModel: "claude-opus-4-6" }),
    });
    expect(result.model).toBe("claude-haiku-4-5");
  });

  test("reason strings reflect the resolved override model", () => {
    const result = resolveStaveTarget({
      prompt: "이 기능 계획 세워줘",
      profile: customProfile({ planModel: "claude-opus-4-6" }),
    });
    expect(result.reason).toContain("claude-opus-4-6");
  });

  test("infers claude-code provider for overridden Claude-family models", () => {
    for (const model of [
      "claude-opus-4-6",
      "opusplan",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]) {
      const result = resolveStaveTarget({
        prompt: "Add error handling",
        profile: customProfile({ generalModel: model }),
      });
      expect(result.providerId).toBe("claude-code");
    }
  });

  test("infers codex provider for overridden Codex-family models", () => {
    for (const model of ["gpt-5.4", "gpt-5.3-codex"]) {
      const result = resolveStaveTarget({
        prompt: "Add error handling",
        profile: customProfile({ generalModel: model }),
      });
      expect(result.providerId).toBe("codex");
    }
  });

  test("falls back to claude-code for an unknown custom model string", () => {
    const result = resolveStaveTarget({
      prompt: "Add error handling",
      profile: customProfile({ generalModel: "my-custom-model" }),
    });
    expect(result.model).toBe("my-custom-model");
    expect(result.providerId).toBe("claude-code");
  });
});

// ── resolveSkillFastPath ──────────────────────────────────────────────────────

function makeSkill(
  overrides: Partial<SkillPromptContext> = {},
): SkillPromptContext {
  return {
    id: "skill-1",
    slug: "commit",
    name: "Commit",
    description: "Create a git commit",
    scope: "local",
    provider: "claude-code",
    path: "/skills/commit.md",
    invocationToken: "$commit",
    instructions: "Run git commit",
    ...overrides,
  };
}

function makeContextParts(
  skills: SkillPromptContext[],
): CanonicalConversationRequest["contextParts"] {
  if (skills.length === 0) {
    return [];
  }
  return [{ type: "skill_context" as const, skills }];
}

describe("resolveSkillFastPath", () => {
  test("returns null when contextParts has no skill_context", () => {
    const result = resolveSkillFastPath({
      contextParts: [],
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).toBeNull();
  });

  test("returns null when skill_context has an empty skills array", () => {
    const result = resolveSkillFastPath({
      contextParts: [{ type: "skill_context", skills: [] }],
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).toBeNull();
  });

  test("routes claude-code skill to generalModel (claude-sonnet-4-6)", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "claude-code" })]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe("claude-code");
    expect(result!.model).toBe("claude-sonnet-4-6");
  });

  test("routes codex skill to implementModel (gpt-5.3-codex)", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "codex" })]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe("codex");
    expect(result!.model).toBe("gpt-5.3-codex");
  });

  test("routes shared skill to generalModel", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "shared" })]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-sonnet-4-6");
  });

  test("routes stave-provider skill to generalModel (treated as shared)", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "stave" })]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-sonnet-4-6");
  });

  test("multiple claude-code skills all route to claude-code", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([
        makeSkill({ id: "s1", name: "Commit", provider: "claude-code" }),
        makeSkill({ id: "s2", name: "Review", provider: "claude-code" }),
      ]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe("claude-code");
    expect(result!.model).toBe("claude-sonnet-4-6");
  });

  test("mixed providers (claude-code + codex) fall back to generalModel", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([
        makeSkill({ id: "s1", name: "Commit", provider: "claude-code" }),
        makeSkill({ id: "s2", name: "Generate", provider: "codex" }),
      ]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    // Mixed → shared → generalModel
    expect(result!.model).toBe("claude-sonnet-4-6");
  });

  test("reason string includes skill name", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ name: "My Cool Skill" })]),
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toContain("My Cool Skill");
    expect(result!.reason).toContain("Skill fast-path");
  });

  test("respects profile overrides for generalModel", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "claude-code" })]),
      profile: customProfile({ generalModel: "claude-opus-4-6" }),
    });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-opus-4-6");
    expect(result!.providerId).toBe("claude-code");
  });

  test("respects profile overrides for implementModel (codex skill)", () => {
    const result = resolveSkillFastPath({
      contextParts: makeContextParts([makeSkill({ provider: "codex" })]),
      profile: customProfile({ implementModel: "gpt-5.4" }),
    });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("gpt-5.4");
    expect(result!.providerId).toBe("codex");
  });

  test("ignores non-skill contextParts (file_context, image_context)", () => {
    const contextParts: CanonicalConversationRequest["contextParts"] = [
      {
        type: "file_context",
        filePath: "/foo.ts",
        content: "const x = 1;",
        language: "typescript",
      },
    ];
    const result = resolveSkillFastPath({
      contextParts,
      profile: DEFAULT_STAVE_AUTO_PROFILE,
    });
    expect(result).toBeNull();
  });
});

describe("resolveForcedStavePlanTarget", () => {
  test("returns null when Claude plan mode is not active", () => {
    expect(
      resolveForcedStavePlanTarget({
        profile: DEFAULT_STAVE_AUTO_PROFILE,
        runtimeOptions: { claudePermissionMode: "acceptEdits" },
      }),
    ).toBeNull();
  });

  test("forces the profile plan model when Stave is in plan mode", () => {
    expect(
      resolveForcedStavePlanTarget({
        profile: DEFAULT_STAVE_AUTO_PROFILE,
        runtimeOptions: { claudePermissionMode: "plan" },
      }),
    ).toEqual({
      providerId: "claude-code",
      model: "opusplan",
      reason: "Plan mode forced -> opusplan",
    });
  });

  test("can force a Codex plan model when the active profile uses one", () => {
    expect(
      resolveForcedStavePlanTarget({
        profile: customProfile({ planModel: "gpt-5.4" }),
        runtimeOptions: { claudePermissionMode: "plan" },
      }),
    ).toEqual({
      providerId: "codex",
      model: "gpt-5.4",
      reason: "Plan mode forced -> gpt-5.4",
    });
  });
});

// ── buildStaveResolvedArgs ────────────────────────────────────────────────────

describe("buildStaveResolvedArgs", () => {
  const target = {
    providerId: "claude-code" as const,
    model: "claude-opus-4-6",
    reason: "test",
  };

  test("replaces providerId with the resolved provider", () => {
    const args = minimalArgs({ providerId: "stave" });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.providerId).toBe("claude-code");
  });

  test("sets model in runtimeOptions", () => {
    const args = minimalArgs();
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.runtimeOptions?.model).toBe("claude-opus-4-6");
  });

  test("preserves existing runtimeOptions fields alongside the new model", () => {
    const args = minimalArgs({
      runtimeOptions: { claudePermissionMode: "acceptEdits", debug: true },
    });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.runtimeOptions?.claudePermissionMode).toBe("acceptEdits");
    expect(resolved.runtimeOptions?.debug).toBe(true);
    expect(resolved.runtimeOptions?.model).toBe("claude-opus-4-6");
  });

  test("preserves all top-level args (prompt, cwd, taskId, etc.)", () => {
    const args = minimalArgs({
      prompt: "hello world",
      cwd: "/my/project",
      taskId: "task-42",
    });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.prompt).toBe("hello world");
    expect(resolved.cwd).toBe("/my/project");
    expect(resolved.taskId).toBe("task-42");
  });

  test("updates conversation.target when conversation is present", () => {
    const args = minimalArgs({
      conversation: {
        mode: "chat",
        history: [],
        input: { role: "user", content: "hi", parts: [] },
        contextParts: [],
        target: { providerId: "stave", model: "stave-auto" },
      },
    });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.conversation?.target.providerId).toBe("claude-code");
    expect(resolved.conversation?.target.model).toBe("claude-opus-4-6");
  });

  test("does not add a conversation field when none was present", () => {
    const args = minimalArgs({ conversation: undefined });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.conversation).toBeUndefined();
  });

  test("preserves conversation history and context parts unchanged", () => {
    const historyEntry = {
      role: "user" as const,
      content: "prev message",
      parts: [],
    };
    const args = minimalArgs({
      conversation: {
        mode: "chat",
        history: [historyEntry],
        input: { role: "user", content: "hi", parts: [] },
        contextParts: [],
        target: { providerId: "stave", model: "stave-auto" },
      },
    });
    const resolved = buildStaveResolvedArgs(args, target);
    expect(resolved.conversation?.history).toEqual([historyEntry]);
  });

  test("correctly routes to codex target", () => {
    const codexTarget = {
      providerId: "codex" as const,
      model: "gpt-5.4",
      reason: "test",
    };
    const args = minimalArgs({ providerId: "stave" });
    const resolved = buildStaveResolvedArgs(args, codexTarget);
    expect(resolved.providerId).toBe("codex");
    expect(resolved.runtimeOptions?.model).toBe("gpt-5.4");
  });

  test("can force Codex plan mode for Stave plan routing", () => {
    const codexTarget = {
      providerId: "codex" as const,
      model: "gpt-5.4",
      reason: "forced plan",
    };
    const args = minimalArgs({
      providerId: "stave",
      runtimeOptions: {
        claudePermissionMode: "plan",
        codexPlanMode: false,
      },
    });
    const resolved = buildStaveResolvedArgs(args, codexTarget, {
      forceCodexPlanMode: true,
    });
    expect(resolved.runtimeOptions?.codexPlanMode).toBe(true);
  });
});
