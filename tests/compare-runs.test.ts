import { describe, expect, test } from "bun:test";
import {
  buildCompareWorkspaceName,
  buildDefaultCompareVariants,
  buildInitialCompareRun,
  deriveCompareSeedTitle,
  normalizeCompareVariants,
} from "../src/lib/compare-runs";

describe("compare run helpers", () => {
  test("builds default Claude and Codex variants from settings models", () => {
    expect(
      buildDefaultCompareVariants({
        modelClaude: "claude-sonnet",
        modelCodex: "gpt-5-codex",
      }),
    ).toEqual([
      {
        provider: "claude-code",
        model: "claude-sonnet",
        label: "Claude",
      },
      {
        provider: "codex",
        model: "gpt-5-codex",
        label: "Codex",
      },
    ]);
  });

  test("normalizes compare variants to supported providers and three entries", () => {
    expect(
      normalizeCompareVariants([
        { provider: "claude-code", model: " claude-sonnet ", label: " A " },
        { provider: "stave", model: "auto", label: "Auto" },
        { provider: "codex", model: " gpt-5-codex ", label: " B " },
        { provider: "claude-code", model: "", label: "" },
        { provider: "codex", model: "extra", label: "Extra" },
      ]),
    ).toEqual([
      {
        provider: "claude-code",
        model: "claude-sonnet",
        label: "A",
      },
      {
        provider: "codex",
        model: "gpt-5-codex",
        label: "B",
      },
      {
        provider: "claude-code",
        model: undefined,
        label: undefined,
      },
    ]);
  });

  test("derives stable run titles and workspace names", () => {
    expect(deriveCompareSeedTitle("\n  Implement provider compare runs\n")).toBe(
      "Implement provider compare runs",
    );
    expect(
      buildCompareWorkspaceName({
        seedPrompt: "Implement provider compare runs!",
        compareRunId: "abcdef123456",
        index: 0,
        provider: "claude-code",
      }),
    ).toBe("compare/abcdef12/1-claude/implement-provider-compare-runs");
  });

  test("builds initial run state with pending variants", () => {
    const run = buildInitialCompareRun({
      id: "compare-1",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      baseBranch: "main",
      variants: [
        { provider: "claude-code", label: "Claude" },
        { provider: "codex", label: "Codex" },
      ],
      now: "2026-06-18T00:00:00.000Z",
    });

    expect(run.status).toBe("starting");
    expect(run.variants.map((variant) => variant.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(run.variants.map((variant) => variant.id)).toEqual([
      "compare-1:variant-1",
      "compare-1:variant-2",
    ]);
  });
});
