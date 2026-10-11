import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildStarterProfile, cloneProfileAsCustom } from "@/lib/providers/auto-routing-profile";
import { writeProviderStrengths } from "@/lib/providers/provider-strength-presets";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 },
    api: {},
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function render(profile = buildStarterProfile("starter-balanced")) {
  const { SettingsProviderStrengths } = await import("../src/components/layout/settings-dialog-provider-strengths");
  return renderToStaticMarkup(createElement(SettingsProviderStrengths, { profile, edit: () => {} }));
}

describe("Provider strengths card", () => {
  test("an untouched profile shows the cautious preset as a suggestion, off, with sources", async () => {
    const html = await render();
    expect(html).toContain("Provider strengths");
    expect(html).toContain("data-testid=\"provider-strengths\"");
    expect(html).toContain("Confident only");
    expect(html).toContain("aria-checked=\"false\"");
    expect(html).toContain("https://macroscope.com/content/ai-code-review-benchmark-best-models");
    expect(html).toContain("not measurements of your work");
    // Row rationale is translated text, not a raw key.
    expect(html).toContain("At the same effort Codex scores clearly higher");
    expect(html).not.toContain("providers:providerStrengths.rationale");
    expect(html).toContain("UI &amp; frontend");
    expect(html).toContain("Logic &amp; backend");
    expect(html).toContain("Other implementation");
  });

  test("a stored custom table reads as Custom and on", async () => {
    const profile = writeProviderStrengths(cloneProfileAsCustom(buildStarterProfile("starter-balanced")), {
      map: { docs: "codex" },
      enabled: true,
    });
    const html = await render(profile);
    expect(html).toContain("Custom");
    expect(html).toContain("aria-checked=\"true\"");
  });
});
