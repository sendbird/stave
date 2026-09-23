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
      providerIds: ["claude-code", "codex", "cursor"],
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "claude-code:claude-sonnet-5",
          model: "claude-sonnet-5",
          providerId: "claude-code",
        }),
        expect.objectContaining({
          key: "claude-code:claude-haiku-4-5",
          model: "claude-haiku-4-5",
          providerId: "claude-code",
          label: "Claude Haiku 4.5",
        }),
        expect.objectContaining({
          key: "codex:gpt-5.6-terra",
          model: "gpt-5.6-terra",
          providerId: "codex",
        }),
        expect.objectContaining({
          key: "cursor:auto",
          model: "auto",
          providerId: "cursor",
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

  test("does not treat an empty model as a selected Claude row", () => {
    expect(buildModelSelectorValue({ model: "" })).toMatchObject({
      model: "",
      label: "Default",
    });
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
      "claude-code:claude-opus-5-5",
      "codex:gpt-6-sol",
      "claude-code:claude-fable-5-1",
      "codex:gpt-6-astra",
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

  test("treats a token already present at mount as handled (no reopen on remount)", () => {
    // Regression: when an interactive question card replaces and then restores
    // the composer, `ModelSelector` unmounts and remounts while the parent's
    // open nonce stays latched (> 0). If the remounted selector seeds its
    // handled token with the current openToken, `shouldOpenModelSelector`
    // must NOT re-open it just because the token is truthy.
    const latchedToken = 3;
    expect(
      shouldOpenModelSelector({
        openToken: latchedToken,
        disabled: false,
        lastHandledOpenToken: latchedToken,
      }),
    ).toBe(false);

    // A genuinely new token pressed after mount still opens the selector.
    expect(
      shouldOpenModelSelector({
        openToken: latchedToken + 1,
        disabled: false,
        lastHandledOpenToken: latchedToken,
      }),
    ).toBe(true);
  });

  test("passes enrichment data (description, isDefault) into built options", () => {
    const enrichment = new Map([
      ["gpt-6-sol", { description: "Flagship model", isDefault: true }],
    ]);
    const options = buildModelSelectorOptions({
      providerIds: ["codex"],
      enrichmentByModel: enrichment,
    });
    const sol = options.find((option) => option.model === "gpt-6-sol");
    expect(sol).toBeDefined();
    expect(sol?.description).toContain("Flagship model");
    expect(sol?.isDefault).toBe(true);

    // Models without enrichment still show runtime compatibility guidance.
    const luna = options.find((option) => option.model === "gpt-6-luna");
    expect(luna?.description).toContain("version and account");
    expect(luna?.isDefault).toBeUndefined();
  });

  test("keeps overlapping runtime model ids scoped to their provider", () => {
    const enrichment = new Map([
      ["codex:gpt-shared", { label: "Codex Shared" }],
      ["cursor:gpt-shared", { label: "Cursor Shared High Fast" }],
    ]);
    const options = buildModelSelectorOptions({
      providerIds: ["codex", "cursor"],
      modelsByProvider: {
        codex: ["gpt-shared"],
        cursor: ["gpt-shared"],
      },
      enrichmentByModel: enrichment,
    });

    expect(options.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "codex:gpt-shared", label: "Codex Shared" },
      { key: "cursor:gpt-shared", label: "Cursor Shared High Fast" },
    ]);
  });
});

test("Opus 5.5 variants advertise their CLI requirement alongside runtime descriptions", () => {
  const options = buildModelSelectorOptions({ providerIds: ["claude-code"], enrichmentByModel: new Map([["claude-opus-5-5", { description: "Runtime catalog" }]]) });
  for (const model of ["claude-opus-5-5", "claude-opus-5-5[1m]"]) {
    expect(options.find(option => option.model === model)?.description).toContain("2.1.280");
  }
  expect(options.find(option => option.model === "claude-opus-5-5")?.description).toContain("Runtime catalog");
  expect(options.find(option => option.model === "claude-haiku-4-5")?.description).toBeUndefined();
});
