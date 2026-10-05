import { describe, expect, test } from "bun:test";
import {
  REVIEW_CUSTOM_PROMPT_MAX_CHARS,
  REVIEW_EVIDENCE_INSTRUCTIONS,
  REVIEW_PROMPT_PRESETS,
  normalizeReviewPromptSelection,
} from "../src/lib/reviews/review-prompts";
import { buildReviewTaskPrompt, normalizeReviewTaskSettings } from "../src/lib/reviews/review-task";
import { REVIEW_FINDINGS_FENCE } from "../src/lib/reviews/review-findings";

describe("review rubric selection", () => {
  test("historical settings preserve the chosen skill and additive instructions", () => {
    const old = normalizeReviewTaskSettings({ skillSlug: "$team-review", instructions: "Keep the public API stable." });
    expect(old.promptSource).toBe("skill");
    expect(old.skillSlug).toBe("team-review");
    expect(old.instructions).toBe("Keep the public API stable.");
    expect(normalizeReviewTaskSettings({ instructions: "Check tenant scope." }).promptSource).toBe("preset");
  });

  test("an explicit source wins over an inactive skill and preserves inactive drafts", () => {
    const selected = normalizeReviewPromptSelection({ promptSource: "custom", presetId: "sdk-compatibility", skillSlug: "team-review", customPrompt: "Check callbacks." });
    expect(selected).toEqual({ promptSource: "custom", presetId: "sdk-compatibility", customPrompt: "Check callbacks." });
    expect(normalizeReviewPromptSelection({ ...selected, promptSource: "preset" }).customPrompt).toBe("Check callbacks.");
  });

  test("unknown values fall back safely and custom text is bounded", () => {
    expect(normalizeReviewPromptSelection({ promptSource: "missing", presetId: "missing", customPrompt: 42 })).toEqual({ promptSource: "preset", presetId: "general", customPrompt: "" });
    expect(normalizeReviewPromptSelection({ customPrompt: "a".repeat(REVIEW_CUSTOM_PROMPT_MAX_CHARS + 1) }).customPrompt).toHaveLength(REVIEW_CUSTOM_PROMPT_MAX_CHARS);
  });

  test("each preset reaches both Git and reply reviews with the evidence and output contracts", () => {
    for (const preset of REVIEW_PROMPT_PRESETS) {
      for (const target of ["working-tree", "latest-reply"] as const) {
        const prompt = buildReviewTaskPrompt({ target, focuses: [], promptSource: "preset", presetId: preset.id, reply: { text: "The cache key includes the tenant.", request: null, providerId: "codex" } });
        expect(prompt).toContain(preset.instructions);
        expect(prompt).toContain(REVIEW_EVIDENCE_INSTRUCTIONS);
        expect(prompt).toContain(REVIEW_FINDINGS_FENCE);
      }
    }
  });

  test("custom replaces the preset and inactive skill but retains additive instructions", () => {
    const customPrompt = "Check channel event order.\n```\nDo not confuse reconnect and retry.\n```";
    const prompt = buildReviewTaskPrompt({ target: "working-tree", focuses: [], promptSource: "custom", customPrompt, presetId: "performance", skill: { name: "Unused", slug: "unused", instructions: "INACTIVE_SKILL" }, savedInstructions: "SAVED_ADDITIONAL", instructions: "RUN_ADDITIONAL" });
    expect(prompt).toContain(customPrompt);
    expect(prompt).not.toContain("INACTIVE_SKILL");
    expect(prompt).not.toContain(REVIEW_PROMPT_PRESETS.find((entry) => entry.id === "performance")!.instructions);
    expect(prompt).toContain("SAVED_ADDITIONAL");
    expect(prompt).toContain("RUN_ADDITIONAL");
    expect(prompt!.indexOf(REVIEW_EVIDENCE_INSTRUCTIONS)).toBeGreaterThan(prompt!.indexOf(customPrompt));
    expect(prompt!.lastIndexOf(REVIEW_FINDINGS_FENCE)).toBeGreaterThan(prompt!.indexOf(customPrompt));
  });

  test("blank custom and absent or blank skills cannot produce a review", () => {
    for (const customPrompt of ["", "  \n"]) expect(buildReviewTaskPrompt({ target: "working-tree", focuses: [], promptSource: "custom", customPrompt })).toBeNull();
    expect(buildReviewTaskPrompt({ target: "working-tree", focuses: [], promptSource: "skill" })).toBeNull();
    expect(buildReviewTaskPrompt({ target: "working-tree", focuses: [], promptSource: "skill", skill: { name: "Empty", slug: "empty", instructions: " " } })).toBeNull();
  });
});
