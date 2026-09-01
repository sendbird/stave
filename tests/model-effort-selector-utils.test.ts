import { describe, expect, test } from "bun:test";
import {
  collapseClaudeContextOptions,
  expandCursorModelFamilies,
  getClaudeContextBaseLabel,
  getCursorModelPresentation,
  getCursorModelVariant,
  groupCursorModelOptions,
  isClaudeContext1MModel,
  listDefaultModelOptions,
  listFeaturedModelOptions,
  listModelEfforts,
  resolveClaudeContextOption,
  resolveCursorModelVariant,
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
      model: "claude-opus-5[thinking=true,context=300k,effort=high,fast=true]",
      label: "Claude Opus 5 · 300K · Thinking · High · Fast",
      defaultEffort: "high",
    });

    expect(getCursorModelPresentation(cursor)).toEqual({
      label: "Claude Opus 5",
      capabilities: ["300K", "Thinking", "Fast", "High"],
    });
  });

  test("keeps bracket syntax out of a model missing from the catalog", () => {
    const cursor = option({
      providerId: "cursor",
      model: "auto-smart[optimize_for=balanced]",
      label: "Auto Smart[optimize_for=balanced]",
    });

    expect(getCursorModelPresentation(cursor)).toEqual({
      label: "Auto Smart",
      capabilities: ["Balanced"],
    });
  });

  test("groups Cursor ACP variants and resolves one-click configuration changes", () => {
    const medium = option({
      providerId: "cursor",
      model: "gpt-5.4[context=272k,reasoning=medium,fast=false]",
      label: "GPT 5.4 · 272K · Medium",
      defaultEffort: "medium",
    });
    const highFast = option({
      providerId: "cursor",
      model: "gpt-5.4[context=272k,reasoning=high,fast=true]",
      label: "GPT 5.4 · 272K · High · Fast",
      defaultEffort: "high",
    });
    const [group] = groupCursorModelOptions([medium, highFast]);
    const anchor = getCursorModelVariant(medium);

    expect(group).toMatchObject({
      baseModel: "gpt-5.4",
      label: "GPT 5.4",
    });
    expect(group?.variants).toHaveLength(2);
    expect(
      resolveCursorModelVariant({
        group: group!,
        anchor,
        patch: { effort: "high" },
      })?.option,
    ).toBe(highFast);
    expect(
      resolveCursorModelVariant({
        group: group!,
        anchor,
        patch: { effort: "xhigh" },
      }),
    ).toBeUndefined();
  });

  test("keeps every advertised Cursor variant for a featured model family", () => {
    const medium = option({
      providerId: "cursor",
      model: "gpt-5.4[reasoning=medium,fast=false]",
    });
    const high = option({
      providerId: "cursor",
      model: "gpt-5.4[reasoning=high,fast=false]",
    });
    const grok = option({ providerId: "cursor", model: "grok-4.6" });

    expect(
      expandCursorModelFamilies({
        options: [medium, high, grok],
        featured: [medium],
      }),
    ).toEqual([medium, high]);
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

  test("keeps Cursor catalog order instead of re-ranking by version number", () => {
    const options = [
      option({ providerId: "cursor", model: "auto-smart" }),
      option({ providerId: "cursor", model: "grok-4.6" }),
      option({ providerId: "cursor", model: "composer-2.5" }),
      option({ providerId: "cursor", model: "claude-fable-5" }),
      option({ providerId: "cursor", model: "gpt-5.6-sol" }),
      option({ providerId: "cursor", model: "claude-opus-5" }),
      option({ providerId: "cursor", model: "gpt-5.5" }),
    ];

    expect(
      listFeaturedModelOptions({ options }).map((candidate) => candidate.model),
    ).toEqual([
      "auto-smart",
      "grok-4.6",
      "composer-2.5",
      "claude-fable-5",
      "gpt-5.6-sol",
      "claude-opus-5",
      "gpt-5.5",
    ]);
  });

  test("lists only the current model per family before the list is expanded", () => {
    const options = [
      option({ providerId: "codex", model: "gpt-5.6-sol" }),
      option({ providerId: "codex", model: "gpt-5.5" }),
      option({ providerId: "codex", model: "gpt-5.4" }),
    ];

    expect(
      listDefaultModelOptions({ providerId: "codex", options }).map(
        (candidate) => candidate.model,
      ),
    ).toEqual(["gpt-5.6-sol", "gpt-5.5"]);
  });

  test("applies settings visibility overrides in both directions", () => {
    const options = [
      option({ providerId: "codex", model: "gpt-5.6-sol" }),
      option({ providerId: "codex", model: "gpt-5.5" }),
      option({ providerId: "codex", model: "gpt-5.4" }),
    ];

    expect(
      listDefaultModelOptions({
        providerId: "codex",
        options,
        visibility: {
          codex: { "gpt-5.6-sol": false, "gpt-5.4": true },
        },
      }).map((candidate) => candidate.model),
    ).toEqual(["gpt-5.5", "gpt-5.4"]);
  });

  test("keeps the selected model listed even when it is turned off", () => {
    const options = [
      option({ providerId: "codex", model: "gpt-5.6-sol" }),
      option({ providerId: "codex", model: "gpt-5.4" }),
    ];

    expect(
      listDefaultModelOptions({
        providerId: "codex",
        options,
        visibility: { codex: { "gpt-5.4": false } },
        selectedModelKey: "codex:gpt-5.4",
      }).map((candidate) => candidate.model),
    ).toEqual(["gpt-5.6-sol", "gpt-5.4"]);
  });

  test("turns a Cursor row on or off across every advertised variant", () => {
    const options = [
      option({ providerId: "cursor", model: "gpt-5.6-sol" }),
      option({
        providerId: "cursor",
        model: "gpt-5.4[context=272k,reasoning=medium,fast=false]",
      }),
      option({
        providerId: "cursor",
        model: "gpt-5.4[context=272k,reasoning=high,fast=true]",
      }),
    ];

    expect(
      listDefaultModelOptions({
        providerId: "cursor",
        options,
        visibility: { cursor: { "gpt-5.4": true } },
      }).map((candidate) => candidate.model),
    ).toEqual([
      "gpt-5.6-sol",
      "gpt-5.4[context=272k,reasoning=medium,fast=false]",
      "gpt-5.4[context=272k,reasoning=high,fast=true]",
    ]);
    expect(
      listDefaultModelOptions({
        providerId: "cursor",
        options,
        visibility: { cursor: { "gpt-5.6-sol": false, "gpt-5.4": false } },
      }),
    ).toEqual([]);
  });

  test("normalizes context labels without changing ordinary names", () => {
    expect(isClaudeContext1MModel("claude-opus-5[1m]")).toBe(true);
    expect(getClaudeContextBaseLabel("Claude Opus 5 (1M)")).toBe(
      "Claude Opus 5",
    );
    expect(getClaudeContextBaseLabel("Claude Fable 5")).toBe("Claude Fable 5");
  });
});
