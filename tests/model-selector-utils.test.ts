import { describe, expect, test } from "bun:test";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  buildRecommendedModelSelectorOptions,
  buildModelSelectorValue,
  shouldOpenModelSelector,
} from "@/components/ai-elements/model-selector.utils";

describe("model selector utils", () => {
  test("can build prompt-input options across all providers", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code", "codex"],
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "claude-code:claude-sonnet-5",
          model: "claude-sonnet-5",
          providerId: "claude-code",
        }),
        expect.objectContaining({
          key: "codex:gpt-5.5",
          model: "gpt-5.5",
          providerId: "codex",
        }),
      ]),
    );
  });

  test("builds provider options without a meta-model", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code", "codex"],
    });

    expect(options.map((option) => option.providerId)).toEqual(
      expect.not.arrayContaining(["stave"]),
    );
  });

  test("builds Auto as a flagged selector option without a magic model id", () => {
    expect(buildAutoModelSelectorOption({ providerId: "claude-code" })).toEqual(
      expect.objectContaining({
        key: "auto",
        providerId: "claude-code",
        model: "",
        label: "Auto",
        isAuto: true,
        available: true,
      }),
    );
  });

  test("prefers per-provider model overrides when supplied", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code", "codex"],
      modelsByProvider: {
        codex: ["gpt-5.4", "gpt-5.3-codex-spark"],
      },
    });

    expect(options.map((option) => option.key)).toEqual(
      expect.arrayContaining(["codex:gpt-5.4", "codex:gpt-5.3-codex-spark"]),
    );
    expect(options.map((option) => option.key)).not.toContain(
      "codex:gpt-5.3-codex",
    );
  });

  test("infers a provider-specific display value from a persisted model id", () => {
    expect(buildModelSelectorValue({ model: "gpt-5.3-codex" })).toMatchObject({
      key: "codex:gpt-5.3-codex",
      providerId: "codex",
      label: "GPT-5.3-Codex",
      available: true,
    });
  });

  test("builds the recommended group from available options in the expected order", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code", "codex"],
      availabilityByProvider: {
        "claude-code": true,
        codex: true,
      },
    });

    expect(
      buildRecommendedModelSelectorOptions({ options }).map(
        (option) => option.key,
      ),
    ).toEqual([
      "claude-code:claude-opus-4-8",
      "codex:gpt-5.5",
      "codex:gpt-5.4",
    ]);
  });

  test("opens the selector only for a new open token", () => {
    expect(
      shouldOpenModelSelector({
        openToken: 1,
        disabled: false,
        lastHandledOpenToken: undefined,
      }),
    ).toBe(true);

    expect(
      shouldOpenModelSelector({
        openToken: 1,
        disabled: false,
        lastHandledOpenToken: 1,
      }),
    ).toBe(false);
  });

  test("does not open the selector while interactions are disabled", () => {
    expect(
      shouldOpenModelSelector({
        openToken: 2,
        disabled: true,
        lastHandledOpenToken: undefined,
      }),
    ).toBe(false);
  });

  test("passes enrichment data (description, isDefault) into built options", () => {
    const enrichment = new Map([
      ["gpt-5.4", { description: "Flagship model", isDefault: true }],
    ]);
    const options = buildModelSelectorOptions({
      providerIds: ["codex"],
      enrichmentByModel: enrichment,
    });
    const gpt54 = options.find((option) => option.model === "gpt-5.4");
    expect(gpt54).toBeDefined();
    expect(gpt54?.description).toBe("Flagship model");
    expect(gpt54?.isDefault).toBe(true);

    // Other models without enrichment should have no description
    const mini = options.find((option) => option.model === "gpt-5.4-mini");
    expect(mini?.description).toBeUndefined();
    expect(mini?.isDefault).toBeUndefined();
  });
});
