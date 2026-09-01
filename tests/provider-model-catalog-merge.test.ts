import { describe, expect, test } from "bun:test";
import { mergeProviderModelCatalogEntries } from "@/lib/providers/use-provider-model-catalogs";
import type { ProviderModelCatalogEntry } from "@/lib/providers/provider.types";

function entry(
  overrides: Partial<ProviderModelCatalogEntry> &
    Pick<ProviderModelCatalogEntry, "model">,
): ProviderModelCatalogEntry {
  return {
    displayName: overrides.model,
    description: "",
    hidden: false,
    isDefault: false,
    defaultEffort: null,
    supportedEfforts: [],
    ...overrides,
  };
}

const CURSOR_AUTO = "auto-smart[optimize_for=balanced]";
const CURSOR_GROK = "grok-4.6[effort=high,fast=true]";

describe("mergeProviderModelCatalogEntries", () => {
  test("folds the provider's auto model into the auto row", () => {
    const merged = mergeProviderModelCatalogEntries({
      providerId: "cursor",
      dynamicEntries: [
        entry({
          model: CURSOR_AUTO,
          displayName: "Auto Balance",
          isDefault: true,
        }),
        entry({ model: CURSOR_GROK, displayName: "Grok 4.6 · High · Fast" }),
      ],
    });

    expect(merged.map((item) => item.model)).toEqual(["auto", CURSOR_GROK]);
    expect(merged[0]?.displayName).toBe("Auto Balance");
    expect(merged[0]?.isDefault).toBe(true);
  });

  test("keeps every advertised model id when the runtime default moves", () => {
    // Stave sets the session model itself, so the next catalog probe reports a
    // different `isDefault`. The advertised ids must not move with it.
    const merged = mergeProviderModelCatalogEntries({
      providerId: "cursor",
      dynamicEntries: [
        entry({ model: CURSOR_AUTO, displayName: "Auto Balance" }),
        entry({
          model: CURSOR_GROK,
          displayName: "Grok 4.6 · High · Fast",
          isDefault: true,
        }),
      ],
    });

    expect(merged.map((item) => item.model)).toEqual(["auto", CURSOR_GROK]);
    expect(merged[0]?.displayName).toBe("Auto Balance");
    expect(merged[1]?.isDefault).toBe(false);
  });

  test("keeps a second auto variant reachable as its own row", () => {
    const merged = mergeProviderModelCatalogEntries({
      providerId: "cursor",
      dynamicEntries: [
        entry({ model: CURSOR_AUTO, displayName: "Auto Balance" }),
        entry({
          model: "auto-smart[optimize_for=speed]",
          displayName: "Auto Speed",
        }),
      ],
    });

    expect(merged.map((item) => item.model)).toEqual([
      "auto",
      "auto-smart[optimize_for=speed]",
    ]);
  });

  test("keeps the runtime default as its own row for Kiro", () => {
    const merged = mergeProviderModelCatalogEntries({
      providerId: "kiro",
      dynamicEntries: [
        entry({
          model: "claude-sonnet-4-5",
          displayName: "Claude Sonnet 4.5",
          isDefault: true,
        }),
      ],
    });

    expect(merged.map((item) => item.model)).toContain("claude-sonnet-4-5");
    expect(merged.map((item) => item.model)).toContain("auto");
  });
});
