import { describe, expect, test } from "bun:test";
import {
  persistModelPickerPreferences,
  resolveSelectedModelEffort,
  stepModelEffort,
} from "@/components/ai-elements/model-effort-step";
import {
  listModelEfforts,
  resolveDefaultModelEffort,
} from "@/components/ai-elements/model-effort-selector.utils";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { isComposerOwnedByPendingInteraction } from "@/components/session/composer-effort-step";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

function option(args: {
  providerId: ProviderId;
  model: string;
  supportedEfforts?: readonly string[];
  defaultEffort?: string;
  isAuto?: boolean;
}): ModelSelectorOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: args.model,
    available: true,
    ...(args.defaultEffort ? { defaultEffort: args.defaultEffort } : {}),
    ...(args.supportedEfforts ? { supportedEfforts: args.supportedEfforts } : {}),
    ...(args.isAuto ? { isAuto: true } : {}),
  };
}

/** One model per provider, with the catalog data the picker lists levels from. */
const PROVIDER_MODELS: readonly ModelSelectorOption[] = [
  option({ providerId: "claude-code", model: "claude-opus-5-5" }),
  option({ providerId: "codex", model: "gpt-6-sol" }),
  // A Codex model with a narrower scale than the provider's.
  option({ providerId: "codex", model: "gpt-6-luna" }),
  option({ providerId: "cursor", model: "composer-2" }),
  option({
    providerId: "kiro",
    model: "kiro-model",
    supportedEfforts: ["low", "medium", "high"],
  }),
  option({ providerId: "kiro", model: "kiro-any" }),
  option({
    providerId: "opencode",
    model: "provider/model",
    supportedEfforts: ["minimal", "low", "medium", "high"],
  }),
];

function walk(value: ModelSelectorOption, direction: 1 | -1, from: string) {
  const seen: string[] = [from];
  let effort = from;
  for (;;) {
    const step = stepModelEffort({
      value,
      options: PROVIDER_MODELS,
      effortValue: effort,
      direction,
    });
    if (!step) return seen;
    expect(step.selection.key).toBe(value.key);
    effort = step.effort;
    seen.push(effort);
  }
}

describe("effort stepping", () => {
  for (const model of PROVIDER_MODELS) {
    test(`${model.providerId} ${model.model}: walks the picker's levels in order and stops at both ends`, () => {
      const levels = listModelEfforts(model).map((level) => level.value);
      expect(levels.length).toBeGreaterThan(1);
      // Up from the lowest visits every level once, then stops: no wrap.
      expect(walk(model, 1, levels[0]!)).toEqual(levels);
      // Down from the highest does the same in reverse.
      expect(walk(model, -1, levels.at(-1)!)).toEqual([...levels].reverse());
    });
  }

  test("the Codex scale follows the model, not the provider", () => {
    const luna = PROVIDER_MODELS.find((model) => model.model === "gpt-6-luna")!;
    const sol = PROVIDER_MODELS.find((model) => model.model === "gpt-6-sol")!;
    expect(listModelEfforts(luna).map((level) => level.value)).not.toContain("ultra");
    expect(
      stepModelEffort({ value: luna, options: PROVIDER_MODELS, effortValue: "max", direction: 1 }),
    ).toBeNull();
    expect(
      stepModelEffort({ value: sol, options: PROVIDER_MODELS, effortValue: "max", direction: 1 })?.effort,
    ).toBe("ultra");
  });

  test("levels come from the catalog row when the composer value lacks them", () => {
    const bare = option({ providerId: "opencode", model: "provider/model" });
    expect(listModelEfforts(bare)).toEqual([]);
    expect(
      stepModelEffort({ value: bare, options: PROVIDER_MODELS, effortValue: "low", direction: 1 }),
    ).toEqual({ selection: PROVIDER_MODELS.at(-1)!, effort: "medium" });
  });

  test("without a held effort the step starts from the default the picker shows", () => {
    const claude = PROVIDER_MODELS[0]!;
    const start = resolveSelectedModelEffort({ value: claude });
    expect(start).toBe(resolveDefaultModelEffort(claude));
    const levels = listModelEfforts(claude).map((level) => level.value);
    expect(
      stepModelEffort({ value: claude, options: PROVIDER_MODELS, direction: 1 })?.effort,
    ).toBe(levels[levels.indexOf(start!) + 1]);
  });

  test("an effort the model does not offer lands on the model's default", () => {
    const luna = PROVIDER_MODELS.find((model) => model.model === "gpt-6-luna")!;
    expect(
      stepModelEffort({ value: luna, options: PROVIDER_MODELS, effortValue: "ultra", direction: -1 })?.effort,
    ).toBe(resolveDefaultModelEffort(luna));
  });

  test("Stave Auto and models without levels do nothing", () => {
    const auto = option({ providerId: "claude-code", model: "", isAuto: true });
    expect(stepModelEffort({ value: auto, options: [auto], direction: 1 })).toBeNull();
    const noLevels = option({ providerId: "opencode", model: "plain/model" });
    expect(stepModelEffort({ value: noLevels, options: [noLevels], direction: 1 })).toBeNull();
    expect(resolveSelectedModelEffort({ value: auto, effortValue: "high" })).toBeUndefined();
  });

  test("a step remembers what the picker remembers for the choice", () => {
    const calls: unknown[] = [];
    persistModelPickerPreferences({
      option: option({ providerId: "cursor", model: "composer-2" }),
      effort: "high",
      updateModelRuntimePreference: (args) => calls.push(args),
    });
    persistModelPickerPreferences({
      option: option({ providerId: "claude-code", model: "claude-opus-5-5[1m]" }),
      effort: "high",
      updateModelRuntimePreference: (args) => calls.push(args),
    });
    persistModelPickerPreferences({
      option: option({ providerId: "codex", model: "gpt-6-sol" }),
      effort: "high",
      updateModelRuntimePreference: (args) => calls.push(args),
    });
    expect(calls).toEqual([
      { providerId: "cursor", model: "composer-2", patch: { effort: "high" } },
      { providerId: "claude-code", model: "claude-opus-5-5", patch: { context1M: true } },
    ]);
  });
});

describe("composer ownership", () => {
  const message = (parts: ChatMessage["parts"]): ChatMessage =>
    ({ id: "a1", role: "assistant", content: "", parts, providerId: "claude-code", model: "m" }) as ChatMessage;

  test("a pending approval or blocking question owns the composer; an async question does not", () => {
    expect(isComposerOwnedByPendingInteraction([])).toBe(false);
    expect(
      isComposerOwnedByPendingInteraction([
        message([
          { type: "approval", toolName: "Bash", description: "", requestId: "r1", state: "approval-requested" },
        ] as ChatMessage["parts"]),
      ]),
    ).toBe(true);
    const question = {
      type: "user_input",
      toolName: "AskUserQuestion",
      requestId: "q1",
      state: "input-requested",
      questions: [],
    };
    expect(
      isComposerOwnedByPendingInteraction([message([question] as ChatMessage["parts"])]),
    ).toBe(true);
    expect(
      isComposerOwnedByPendingInteraction([
        message([{ ...question, delivery: "async" }] as ChatMessage["parts"]),
      ]),
    ).toBe(false);
    expect(
      isComposerOwnedByPendingInteraction([
        message([{ ...question, state: "input-responded" }] as ChatMessage["parts"]),
      ]),
    ).toBe(false);
  });
});
