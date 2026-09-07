import { describe, expect, test } from "bun:test";
import {
  readCursorComposerSettings,
  resolveCursorComposerControls,
  shouldPersistCursorComposerSelection,
} from "@/components/ai-elements/cursor-model-runtime";
import { defaultSettings } from "@/store/app-settings";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";

function cursorOption(model: string): ModelSelectorOption {
  return {
    key: `cursor:${model}`,
    providerId: "cursor",
    model,
    label: model,
    available: true,
  };
}

describe("Cursor composer runtime helpers", () => {
  test("reads the persisted Cursor effort and fast mode", () => {
    expect(
      readCursorComposerSettings({
        settings: {
          ...defaultSettings,
          cursorEffort: "high",
          cursorFastMode: true,
        },
        model: "gpt-5.6-sol",
      }),
    ).toEqual({
      effort: "high",
      fastMode: true,
    });
  });

  test("prefers composer props and falls back to stored Cursor values", () => {
    expect(
      resolveCursorComposerControls({
        selectedModel: cursorOption("gpt-5.6-sol"),
        storeEffort: "medium",
        storeFastMode: false,
      }),
    ).toEqual({
      effortValue: "medium",
      effortLabel: "Medium",
      fastMode: false,
    });
    expect(
      resolveCursorComposerControls({
        selectedModel: cursorOption("gpt-5.6-sol"),
        effortValue: "high",
        effortLabel: "High",
        fastMode: true,
        storeEffort: "medium",
        storeFastMode: false,
      }),
    ).toEqual({
      effortValue: "high",
      effortLabel: "High",
      fastMode: true,
    });
  });

  test("persists only Cursor composer selections that change effort or fast", () => {
    expect(
      shouldPersistCursorComposerSelection({
        providerId: "cursor",
        effort: "high",
      }),
    ).toBe(true);
    expect(
      shouldPersistCursorComposerSelection({
        providerId: "codex",
        effort: "high",
        fastMode: true,
      }),
    ).toBe(false);
  });
});
