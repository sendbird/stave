import { afterEach, describe, expect, test } from "bun:test";

import { applyAppLocale } from "@/i18n";
import { modelPickerOptions, modelPriceLabel } from "@/components/ai-elements/model-picker-options";
import { matchesSearchablePickerOption } from "@/components/layout/searchable-picker-option";
import { MODEL_PRICING, formatModelPrice } from "@/lib/providers/model-catalog";

const pricedModel = Object.keys(MODEL_PRICING).find((model) => model.startsWith("claude-"))!;

describe("model picker options", () => {
  afterEach(() => applyAppLocale("en"));

  test("a model with a published price shows it; an unpriced model shows nothing", () => {
    expect(pricedModel).toBeTruthy();
    expect(modelPriceLabel(pricedModel)).toBe(`${formatModelPrice(pricedModel)} / MTok`);
    // Runtime-catalog providers bill through their own plans: no guessed number.
    expect(modelPriceLabel("cursor-composer-2")).toBeNull();
    expect(modelPriceLabel("kiro-auto")).toBeNull();
  });

  test("rows carry the readable name and id for search, and the price only as a muted value", () => {
    const [priced, unpriced] = modelPickerOptions({ providerId: "claude-code", models: [pricedModel, "claude-unpublished-x"] });
    expect(priced?.detail).toBe(pricedModel);
    expect(priced?.meta).toContain("/ MTok");
    expect(unpriced?.meta).toBeUndefined();
    expect(matchesSearchablePickerOption(priced!, pricedModel)).toBe(true);
    expect(matchesSearchablePickerOption(priced!, "MTok")).toBe(false);
  });

  test("the price unit reads in Korean", () => {
    applyAppLocale("ko");
    expect(modelPriceLabel(pricedModel)).toBe(`MTok당 ${formatModelPrice(pricedModel)}`);
  });
});
