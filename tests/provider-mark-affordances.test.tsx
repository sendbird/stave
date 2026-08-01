import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  ChoiceButtons,
  LabeledField,
} from "@/components/layout/settings-dialog.shared";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  getProviderIconUrl,
} from "@/lib/providers/model-catalog";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    localStorage: createMemoryStorage(),
    location: { href: "https://stave.test/workspace" },
  } as unknown;
}

describe("provider marks", () => {
  test("resolves one mark per vendor, independent of the model", () => {
    const claudeUrls = CLAUDE_SDK_MODEL_OPTIONS.map(() =>
      getProviderIconUrl({ providerId: "claude-code" }),
    );

    // The contract this pins down: a mark identifies the vendor, not the model.
    // Opus, Sonnet and Fable deliberately share one mark, so a per-row mark in a
    // single-provider list is an anchor rather than a distinction.
    expect(new Set(claudeUrls).size).toBe(1);
    expect(getProviderIconUrl({ providerId: "claude-code" })).not.toBe(
      getProviderIconUrl({ providerId: "codex" }),
    );
  });

  test("keeps marks out of accessible names", () => {
    const html = renderToStaticMarkup(
      createElement(ModelIcon, {
        providerId: "codex",
        model: "gpt-5.6-terra",
      }),
    );

    // Every surface that gained a mark is matched by tests and Playwright on its
    // accessible name. An empty alt plus aria-hidden is what keeps those matches
    // byte-identical, so the mark can never widen or break a name lookup.
    expect(html).toContain('alt=""');
    expect(html).toContain("aria-hidden");
    expect(html).toContain("codex-color.svg");
  });

  test("marks a provider choice without changing its label or labelling", () => {
    const html = renderToStaticMarkup(
      createElement(
        LabeledField,
        { title: "Advisor" },
        createElement(ChoiceButtons, {
          value: "claude-code",
          onChange: () => {},
          options: [
            {
              value: "off",
              label: "Off",
              description: "Start the primary provider immediately.",
            },
            {
              value: "claude-code",
              label: "Claude",
              description: "Use an isolated Claude SDK turn.",
              icon: createElement(ModelIcon, { providerId: "claude-code" }),
            },
          ],
        }),
      ),
    );

    expect(html).toContain("claude-color.svg");
    // The label stays a plain string: it is the announced name and the thing the
    // row truncates against, which is why the mark is its own field.
    expect(html).toContain(">Claude<");
    expect(html).toMatch(/role="radiogroup" aria-labelledby="[^"]+"/);
    // A choice with no vendor behind it gets no mark rather than a stand-in.
    expect(html.match(/claude-color\.svg/g)).toHaveLength(1);
  });

  test("shows the mark on the collapsed model trigger, not just the provider one", async () => {
    setWindowContext();
    const { ProviderModelPicker } = await import(
      "@/components/session/ProviderModelPicker"
    );

    const html = renderToStaticMarkup(
      createElement(ProviderModelPicker, {
        selectedProvider: "codex",
        selectedModel: "gpt-5.6-terra",
        onProviderChange: () => {},
        onModelChange: () => {},
      }),
    );

    // Base UI's `SelectValue` replays the selected item's children, so marking
    // the items is what marks the closed trigger. Two triggers, two marks —
    // before this change the model trigger showed bare text.
    expect(html.match(/codex-color\.svg/g)).toHaveLength(2);
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});
