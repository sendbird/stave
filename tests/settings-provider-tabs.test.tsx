import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "@/components/ui";
import { SettingsProviderTabsList } from "@/components/layout/settings-provider-tabs";
import type { ProviderId } from "@/lib/providers/provider.types";

const PROVIDERS = ["claude-code", "codex", "cursor", "kiro"] as const satisfies
  readonly ProviderId[];

function renderStrip() {
  return renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: "claude-code" },
      createElement(SettingsProviderTabsList, {
        providerIds: PROVIDERS,
        "aria-label": "Provider settings",
      }),
    ),
  );
}

describe("SettingsProviderTabsList", () => {
  test("renders every provider tab with its mark followed by its label", () => {
    const html = renderStrip();
    expect(html).toContain('aria-label="Provider settings"');
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>.*?<\/button>/g) ?? [];
    expect(tabs).toHaveLength(PROVIDERS.length);
    for (const [index, label] of ["Claude", "Codex", "Cursor", "Kiro"].entries()) {
      const tab = tabs[index] ?? "";
      // A mark (image or fallback glyph) must precede the label in every tab,
      // so no provider strip renders text-only.
      expect(tab).toMatch(/<(img|span)[^>]*aria-hidden/);
      expect(tab).toContain(`>${label}</button>`);
    }
  });

  test("gives every tab the same class list apart from state", () => {
    const html = renderStrip();
    const classes = [...html.matchAll(/<button[^>]*role="tab"[^>]*class="([^"]*)"/g)]
      .map((match) => match[1]);
    expect(classes).toHaveLength(PROVIDERS.length);
    // Inactive tabs share one class list; the strip has no per-provider styling.
    expect(new Set(classes.slice(1)).size).toBe(1);
  });
});
