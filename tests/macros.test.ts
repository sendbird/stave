import { describe, expect, test } from "bun:test";
import { buildMacroRuntimeOverrides } from "@/lib/macros/apply";
import {
  generateMacroId,
  normalizeMacro,
  normalizePersistedMacros,
  slugifyMacroLabel,
} from "@/lib/macros/normalize";
import { isMacroInstantRun, MAX_MACROS } from "@/lib/macros/types";

describe("slugifyMacroLabel", () => {
  test("derives a lowercase hyphenated slug", () => {
    expect(slugifyMacroLabel("Conventional Commit")).toBe(
      "conventional-commit",
    );
    expect(slugifyMacroLabel("  Review PR!! ")).toBe("review-pr");
  });
});

describe("normalizeMacro", () => {
  test("fills defaults and keeps a valid runtime pin", () => {
    const macro = normalizeMacro({
      label: "Commit",
      slug: "commit",
      body: "Write a conventional commit message.",
      runtime: {
        providerId: "claude-code",
        model: "claude-opus-5",
        effort: "high",
      },
    });

    expect(macro).not.toBeNull();
    expect(macro?.id.startsWith("macro_")).toBe(true);
    expect(macro?.insertMode).toBe("replace");
    expect(macro?.instantRun).toBeUndefined();
    expect(macro?.runtime?.providerId).toBe("claude-code");
    expect(macro?.runtime?.model).toBe("claude-opus-5");
    expect(macro?.runtime?.effort).toBe("high");
  });

  test("keeps instantRun only when it is explicitly true", () => {
    const instant = normalizeMacro({
      label: "Ship",
      slug: "ship",
      body: "Ship the current changes.",
      instantRun: true,
    });
    const ignored = normalizeMacro({
      label: "Ship",
      slug: "ship",
      body: "Ship the current changes.",
      instantRun: "yes",
    });

    expect(instant?.instantRun).toBe(true);
    expect(ignored?.instantRun).toBeUndefined();
    expect(isMacroInstantRun(instant!)).toBe(true);
    expect(isMacroInstantRun(ignored!)).toBe(false);
  });

  test("drops a row without a usable label or slug", () => {
    expect(normalizeMacro({ body: "hello" })).toBeNull();
    expect(normalizeMacro({ label: "!!!", body: "hello" })).toBeNull();
  });

  test("clamps a Codex-only effort off Claude", () => {
    const macro = normalizeMacro({
      label: "Deep review",
      slug: "deep-review",
      body: "Review this carefully.",
      runtime: {
        providerId: "claude-code",
        model: "claude-opus-5",
        effort: "ultra",
      },
    });

    expect(macro?.runtime?.providerId).toBe("claude-code");
    expect(macro?.runtime?.effort).not.toBe("ultra");
  });

  test("drops cursor and kiro runtime pins", () => {
    const macro = normalizeMacro({
      label: "Ask",
      slug: "ask",
      body: "Explain this.",
      runtime: {
        providerId: "cursor",
        model: "auto",
      },
    });

    expect(macro?.runtime).toBeUndefined();
  });
});

describe("normalizePersistedMacros", () => {
  test("returns an empty list for non-arrays", () => {
    expect(normalizePersistedMacros(null)).toEqual([]);
    expect(normalizePersistedMacros({ label: "x" })).toEqual([]);
  });

  test("drops bad rows and duplicate slugs", () => {
    const macros = normalizePersistedMacros([
      { label: "Commit", slug: "commit", body: "A" },
      { label: "Also commit", slug: "commit", body: "B" },
      { label: "", body: "skip" },
      "nope",
    ]);

    expect(macros).toHaveLength(1);
    expect(macros[0]?.slug).toBe("commit");
    expect(macros[0]?.body).toBe("A");
  });

  test("caps the persisted list", () => {
    const input = Array.from({ length: MAX_MACROS + 5 }, (_, index) => ({
      id: generateMacroId(),
      label: `Macro ${index}`,
      slug: `macro-${index}`,
      body: "body",
    }));
    expect(normalizePersistedMacros(input)).toHaveLength(MAX_MACROS);
  });
});

describe("buildMacroRuntimeOverrides", () => {
  test("pins model and effort without leaking the other provider field", () => {
    const next = buildMacroRuntimeOverrides({
      current: {
        claudeEffort: "low",
        boundSecretIds: ["secret-1"],
      },
      runtime: {
        providerId: "codex",
        model: "gpt-5.6-terra",
        effort: "high",
      },
    });

    expect(next.model).toBe("gpt-5.6-terra");
    expect(next.modelProviderId).toBe("codex");
    expect(next.autoRouting).toBe(false);
    expect(next.codexReasoningEffort).toBe("high");
    expect(next.claudeEffort).toBeUndefined();
    expect(next.boundSecretIds).toEqual(["secret-1"]);
  });
});
