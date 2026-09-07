import { describe, expect, test } from "bun:test";
import { mapCodexModelCatalogEntry } from "../electron/providers/codex-snapshot-mappers";

/**
 * Payload captured verbatim from `codex app-server` `model/list`
 * (codex-cli 0.153.0-alpha.5): every supported tier arrives as an object
 * keyed by `reasoningEffort`, not as a bare string and not under `value`.
 */
const ASTRA_MODEL_LIST_ENTRY = {
  id: "gpt-6-astra",
  model: "gpt-6-astra",
  displayName: "GPT-6-Astra",
  hidden: false,
  isDefault: true,
  defaultReasoningEffort: "medium",
  supportedReasoningEfforts: [
    { reasoningEffort: "low", description: "Fast responses with lighter reasoning" },
    { reasoningEffort: "medium", description: "Balances speed and reasoning depth" },
    { reasoningEffort: "high", description: "Greater reasoning depth" },
    { reasoningEffort: "xhigh", description: "Extra high reasoning depth" },
    { reasoningEffort: "max", description: "Maximum reasoning depth" },
    { reasoningEffort: "ultra", description: "Maximum reasoning with delegation" },
  ],
};

describe("codex model/list reasoning-effort mapping", () => {
  // Regression: reading only `entry.value` collapsed every tier to "" and the
  // trailing filter dropped the whole list, so Stave believed no model
  // restricted its effort scale. That silently disabled the per-model clamp
  // and made downstream fallbacks reach for the model default instead.
  test("reads the reasoningEffort key the CLI actually sends", () => {
    const mapped = mapCodexModelCatalogEntry(ASTRA_MODEL_LIST_ENTRY);

    expect(mapped.supportedReasoningEfforts).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(mapped.defaultReasoningEffort).toBe("medium");
  });

  test("still accepts bare strings and the legacy value key", () => {
    expect(
      mapCodexModelCatalogEntry({
        model: "gpt-5.6-luna",
        supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
      }).supportedReasoningEfforts,
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);

    expect(
      mapCodexModelCatalogEntry({
        model: "gpt-5.5",
        supportedReasoningEfforts: [{ value: "low" }, { value: "high" }],
      }).supportedReasoningEfforts,
    ).toEqual(["low", "high"]);
  });

  test("drops unrecognized entry shapes without emptying known ones", () => {
    expect(
      mapCodexModelCatalogEntry({
        model: "gpt-6-astra",
        supportedReasoningEfforts: [
          { reasoningEffort: "  ultra  " },
          { nope: true },
          "",
          null,
        ],
      }).supportedReasoningEfforts,
    ).toEqual(["ultra"]);
  });
});
