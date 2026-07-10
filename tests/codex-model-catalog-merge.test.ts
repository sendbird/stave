import { describe, expect, test } from "bun:test";
import { CODEX_MODEL_OPTIONS } from "@/lib/providers/model-catalog";
import { mergeCodexModelsWithCatalog } from "@/lib/providers/use-codex-model-catalog";

describe("mergeCodexModelsWithCatalog", () => {
  test("keeps the full static catalog when the server reports an older lineup", () => {
    const merged = mergeCodexModelsWithCatalog([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5-codex",
    ]);
    for (const model of CODEX_MODEL_OPTIONS) {
      expect(merged).toContain(model);
    }
    // Server-only extras are appended after the static catalog.
    expect(merged.indexOf("gpt-5.6-sol")).toBeLessThan(
      merged.indexOf("gpt-5.4"),
    );
    expect(merged).toContain("gpt-5-codex");
  });

  test("does not duplicate models present in both lists", () => {
    const merged = mergeCodexModelsWithCatalog([...CODEX_MODEL_OPTIONS]);
    expect(merged).toEqual([...CODEX_MODEL_OPTIONS]);
  });

  test("preserves catalog order first, then dynamic extras in server order", () => {
    const merged = mergeCodexModelsWithCatalog(["gpt-7", "gpt-6"]);
    expect(merged).toEqual([...CODEX_MODEL_OPTIONS, "gpt-7", "gpt-6"]);
  });
});
