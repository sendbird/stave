import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ReviewPromptPicker } from "@/components/ai-elements/review-prompt-picker";
import { REVIEW_PROMPT_PRESETS, REVIEW_PROMPT_SOURCE_OPTIONS } from "@/lib/reviews/review-prompts";
import { buildReviewTaskPrompt } from "@/lib/reviews/review-task";

afterEach(() => applyAppLocale("en"));

test("review labels follow the display language while model prompts stay identical", () => {
  applyAppLocale("en");
  const prompts = REVIEW_PROMPT_PRESETS.map((preset) => buildReviewTaskPrompt({
    target: "working-tree", focuses: [], promptSource: "preset", presetId: preset.id,
  }));
  const labels = REVIEW_PROMPT_PRESETS.map((preset) => preset.label);
  applyAppLocale("ko");
  expect(REVIEW_PROMPT_SOURCE_OPTIONS[0].label).toBe("기본 제공 프리셋");
  REVIEW_PROMPT_PRESETS.forEach((preset, index) => {
    expect(preset.label).not.toBe(labels[index]);
    expect(buildReviewTaskPrompt({
      target: "working-tree", focuses: [], promptSource: "preset", presetId: preset.id,
    })).toBe(prompts[index]);
  });
});

test("custom review copy translates whole sentences and preserves the user's draft", () => {
  applyAppLocale("ko");
  const markup = renderToStaticMarkup(<ReviewPromptPicker
    selection={{ promptSource: "custom", presetId: "general", customPrompt: "MY_REVIEW_DRAFT" }}
    skillSlug="" skillOptions={[]} onChange={() => {}}
  />);
  expect(markup).toContain("사용자 지정 리뷰 프롬프트");
  expect(markup).toContain("최대 12,000자");
  expect(markup).toContain("MY_REVIEW_DRAFT");
  expect(markup).not.toContain("{{");
});
