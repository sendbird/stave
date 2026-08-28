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
  test("shows provider setup and an honest unchecked state", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard tab={null} {...fallbackOff} />,
    );

    expect(html).toContain("Browser access");
    expect(html).toContain("Claude Code browser access: Not checked");
    expect(html).toContain("Codex browser access: Not checked");
    expect(html).toContain("chrome@openai-bundled");
    expect(html).toContain("new interactive prompt containing");
  });

  test("attributes the latest workspace result only to its provider", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard
        tab={{
          providerId: "claude-code",
          status: "connected",
          requestedAt: "2026-08-11T05:00:00.000Z",
          lastUpdatedAt: "2026-08-11T05:00:01.000Z",
        }}
        {...fallbackOff}
      />,
    );

    expect(html).toContain("Claude Code browser access: Connected");
    expect(html).toContain("Codex browser access: No recent result");
    expect(html).toContain("confirmed its native browser tools");
    expect(html).toContain(
      "retains its latest @web result from the other provider",
    );
    expect(html).not.toContain("cookie");
    expect(html).not.toContain("session token");
  });

  test("gives an unavailable provider a concrete recovery path", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard
        tab={{
          providerId: "codex",
          status: "failed",
          requestedAt: "2026-08-11T05:00:00.000Z",
          lastUpdatedAt: "2026-08-11T05:00:01.000Z",
        }}
        {...fallbackOff}
      />,
    );

    expect(html).toContain("Codex browser access: Unavailable");
    expect(html).toContain("Install and enable chrome@openai-bundled");
    expect(html).toContain("then try @web again");
  });
});

describe("ProviderBrowserAccessSettingsCard automatic fallback", () => {
  test("keeps the extra host list hidden until fallback is enabled", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard tab={null} {...fallbackOff} />,
    );

    expect(html).toContain("Automatic browser fallback");
    expect(html).not.toContain("Additional auto-arm hosts");
  });

  test("shows the built-in hosts alongside the user's own when enabled", () => {
    const html = renderToStaticMarkup(
      <ProviderBrowserAccessSettingsCard
        tab={null}
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
