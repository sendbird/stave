import { describe, expect, test } from "bun:test";
import {
  collapseClaudeContextOptions,
  getClaudeContextBaseLabel,
  getCursorModelPresentation,
  isClaudeContext1MModel,
  listFeaturedModelOptions,
  listModelEfforts,
  resolveClaudeContextOption,
  supportsClaudeContextToggle,
} from "@/components/ai-elements/model-effort-selector.utils";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import type { ProviderId } from "@/lib/providers/provider.types";

function option(args: {
  providerId: ProviderId;
  model: string;
  label?: string;
  defaultEffort?: string;
  supportedEfforts?: readonly string[];
}): ModelSelectorOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: args.label ?? args.model,
    available: true,
    defaultEffort: args.defaultEffort,
    supportedEfforts: args.supportedEfforts,
  };
}

describe("model effort selector utilities", () => {
  test("collapses Claude context variants into the active capability state", () => {
    const base = option({
      providerId: "claude-code",
      model: "claude-opus-5",
      label: "Claude Opus 5",
    });
    const context = option({
      providerId: "claude-code",
      model: "claude-opus-5[1m]",
      label: "Claude Opus 5 (1M)",
    });

    expect(
      collapseClaudeContextOptions({
        options: [base, context],
        context1M: false,
      }),
    ).toEqual([base]);
    expect(
      collapseClaudeContextOptions({
        options: [base, context],
        context1M: true,
      }),
    ).toEqual([context]);
    expect(
      supportsClaudeContextToggle({ options: [base, context], option: base }),
    ).toBe(true);
    expect(
      resolveClaudeContextOption({
        options: [base, context],
        option: base,
        context1M: true,
      }),
    ).toBe(context);
  });

  test("keeps unmatched Claude models available without inventing a 1M pair", () => {
    const fable = option({
      providerId: "claude-code",
      model: "claude-fable-5",
    });

    expect(
      supportsClaudeContextToggle({ options: [fable], option: fable }),
    ).toBe(false);
    expect(
      collapseClaudeContextOptions({
        options: [fable],
        context1M: true,
      }),
    ).toEqual([fable]);
  });

  test("uses the Kiro CLI effort scale when model metadata is empty", () => {
    const automatic = option({
      providerId: "kiro",
      model: "auto",
      supportedEfforts: [],
    });
    const legacy = option({ providerId: "kiro", model: "legacy" });
    const bounded = option({
      providerId: "kiro",
      model: "bounded",
      supportedEfforts: ["medium", "high"],
    });

    expect(listModelEfforts(automatic).map((effort) => effort.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(listModelEfforts(legacy).map((effort) => effort.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(listModelEfforts(bounded).map((effort) => effort.value)).toEqual([
      "medium",
      "high",
    ]);
  });

  test("exposes only the effort embedded in a Cursor catalog model", () => {
    const high = option({
      providerId: "cursor",
      model: "grok-4.6[effort=high,fast=true]",
      defaultEffort: "high",
      supportedEfforts: [],
    });
    const extraHigh = option({
      providerId: "cursor",
      model: "cursor-model[reasoning=extra-high]",
      defaultEffort: "extra-high",
    });
    const unspecified = option({ providerId: "cursor", model: "auto-smart" });

    expect(listModelEfforts(high).map((effort) => effort.value)).toEqual([
      "high",
    ]);
    expect(listModelEfforts(extraHigh).map((effort) => effort.value)).toEqual([
      "xhigh",
    ]);
    expect(listModelEfforts(unspecified)).toEqual([]);
  });

  test("separates Cursor model names from runtime capability labels", () => {
    const cursor = option({
      providerId: "cursor",
      model:
        "claude-opus-5[thinking=true,context=300k,effort=high,fast=true]",
      label: "Claude Opus 5 · 300K · Thinking · High · Fast",
      defaultEffort: "high",
    });

    expect(getCursorModelPresentation(cursor)).toEqual({
      label: "Claude Opus 5",
      capabilities: ["300K", "Thinking", "Fast", "High"],
    });
  });

  test("keeps one current model per lineage in the featured catalog", () => {
    const options = [
      option({ providerId: "cursor", model: "grok-4.6" }),
      option({ providerId: "cursor", model: "grok-4.5" }),
      option({ providerId: "cursor", model: "claude-opus-5" }),
      option({ providerId: "cursor", model: "claude-opus-4-8" }),
      option({ providerId: "cursor", model: "gpt-5.6-sol" }),
      option({ providerId: "cursor", model: "gpt-5.5" }),
      option({ providerId: "cursor", model: "gpt-5.4" }),
    ];

    expect(
      listFeaturedModelOptions({
        options,
        selectedModelKey: "cursor:grok-4.5",
      }).map((candidate) => candidate.model),
    ).toEqual([
      "grok-4.6",
      "grok-4.5",
      "claude-opus-5",
      "gpt-5.6-sol",
      "gpt-5.5",
    ]);
  });

  test("normalizes context labels without changing ordinary names", () => {
    expect(isClaudeContext1MModel("claude-opus-5[1m]")).toBe(true);
    expect(getClaudeContextBaseLabel("Claude Opus 5 (1M)")).toBe(
      "Claude Opus 5",
    );
    expect(getClaudeContextBaseLabel("Claude Fable 5")).toBe("Claude Fable 5");
  });
});
