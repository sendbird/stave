import { describe, expect, test } from "bun:test";
import {
  buildClaudeModelEffortRows,
  buildCodexModelEffortRows,
  isClaudeContext1MModel,
  resolveClaudeMatrixOption,
} from "@/components/ai-elements/model-effort-selector.utils";
import { buildModelSelectorOptions } from "@/components/ai-elements/model-selector.utils";

describe("model effort selector utils", () => {
  const options = buildModelSelectorOptions({
    providerIds: ["claude-code", "codex"],
  });

  test("builds only the primary Claude families as matrix rows", () => {
    const rows = buildClaudeModelEffortRows(options);

    expect(rows.map((row) => row.shortLabel)).toEqual([
      "Fable",
      "Opus",
      "Sonnet",
    ]);
    expect(rows.map((row) => row.option.model)).toEqual([
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-sonnet-5",
    ]);
  });

  test("resolves supported Claude rows to their 1M variants", () => {
    const rows = buildClaudeModelEffortRows(options);
    const opus = rows.find((row) => row.shortLabel === "Opus");
    const fable = rows.find((row) => row.shortLabel === "Fable");

    expect(opus).toBeDefined();
    expect(fable).toBeDefined();
    expect(
      resolveClaudeMatrixOption({ row: opus!, context1M: true }).model,
    ).toBe("claude-opus-4-8[1m]");
    expect(
      resolveClaudeMatrixOption({ row: fable!, context1M: true }).model,
    ).toBe("claude-fable-5");
  });

  test("builds the Sol, Terra, and Luna Codex rows in product order", () => {
    expect(
      buildCodexModelEffortRows(options).map((row) => row.shortLabel),
    ).toEqual(["Sol", "Terra", "Luna"]);
  });

  test("detects persisted 1M model selections", () => {
    expect(isClaudeContext1MModel("claude-sonnet-5[1m]")).toBe(true);
    expect(isClaudeContext1MModel("claude-sonnet-5")).toBe(false);
  });
});
