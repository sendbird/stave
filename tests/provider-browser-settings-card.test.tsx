import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderBrowserAccessSettingsCard } from "../src/components/layout/ProviderBrowserAccessSettingsCard";

const fallbackOff = {
  mode: "explicit",
  onModeChange: () => {},
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

describe("ProviderBrowserAccessSettingsCard browser mode", () => {
  test("offers all three modes and hides the host list outside Automatic", () => {
    for (const mode of ["explicit", "always"] as const) {
      const html = renderToStaticMarkup(
        <ProviderBrowserAccessSettingsCard {...fallbackOff} mode={mode} />,
      );
      expect(html).toContain("When the agent may use Chrome");
      expect(html).toContain("Only with @web");
      expect(html).toContain("Automatic");
      expect(html).toContain("Attaches Chrome to every interactive turn");
      expect(html).not.toContain("Additional auto-arm hosts");
    }
  });

  test("shows the built-in hosts alongside the user's own in Automatic", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard
        {...fallbackOff}
        mode="auto"
        autoFallbackDomains="wiki.corp.example"
      />,
    );

    expect(html).toContain("Additional auto-arm hosts");
    expect(html).toContain("claude.ai");
    expect(html).toContain("wiki.corp.example");
    // The hard blocks must stay stated in every mode.
    expect(html).toContain("keep provider-native browser access off in every mode");
  });
});
