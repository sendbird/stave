import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderBrowserAccessSettingsCard } from "../src/components/layout/ProviderBrowserAccessSettingsCard";

const fallbackOff = {
  autoFallback: false,
  onAutoFallbackChange: () => {},
  autoFallbackDomains: "",
  onAutoFallbackDomainsChange: () => {},
} as const;

describe("ProviderBrowserAccessSettingsCard", () => {
  test("shows provider setup without storing a connection status", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard {...fallbackOff} />,
    );

    expect(html).toContain("Browser access");
    expect(html).toContain("Claude Code browser access setup");
    expect(html).toContain("Codex browser access setup");
    expect(html).toContain("chrome@openai-bundled");
    expect(html).toContain("Enable chrome@openai-bundled");
    expect(html).toContain("unified-computer-use@openai-bundled");
    expect(html).toContain("then try @web again");
    expect(html).toContain("any failure is reported in the conversation");
    expect(html).not.toContain("Connected");
    expect(html).not.toContain("Not verified");
    expect(html).not.toContain("Unavailable");
  });
});

describe("ProviderBrowserAccessSettingsCard automatic fallback", () => {
  test("keeps the extra host list hidden until fallback is enabled", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard {...fallbackOff} />,
    );

    expect(html).toContain("Automatic browser fallback");
    expect(html).not.toContain("Additional auto-arm hosts");
  });

  test("shows the built-in hosts alongside the user's own when enabled", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard
        autoFallback
        onAutoFallbackChange={() => {}}
        autoFallbackDomains="wiki.corp.example"
        onAutoFallbackDomainsChange={() => {}}
      />,
    );

    expect(html).toContain("Additional auto-arm hosts");
    expect(html).toContain("claude.ai");
    expect(html).toContain("wiki.corp.example");
    // The hard blocks must stay stated even with fallback on.
    expect(html).toContain("never overrides them");
  });
});
