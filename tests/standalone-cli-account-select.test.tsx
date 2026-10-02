import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StandaloneCliAccountSelect } from "@/components/layout/standalone-cli/StandaloneCliAccountSelect";
import { TooltipProvider } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { listStandaloneCliAccountOptions } from "@/lib/terminal/standalone-cli";

const profiles: ProviderAccountProfile[] = [
  { id: "system-default", providerId: "claude-code", label: "System default", kind: "system" },
  { id: "claude-work", providerId: "claude-code", label: "Work", kind: "managed" },
  { id: "system-default", providerId: "codex", label: "System default", kind: "system" },
  { id: "codex-personal", providerId: "codex", label: "Personal", kind: "managed" },
];

describe("listStandaloneCliAccountOptions", () => {
  test("offers only the tab's own provider accounts", () => {
    expect(
      listStandaloneCliAccountOptions({ tabId: "claude-code", profiles }).map((profile) => profile.id),
    ).toEqual(["system-default", "claude-work"]);
    expect(
      listStandaloneCliAccountOptions({ tabId: "codex", profiles }).map((profile) => profile.label),
    ).toEqual(["System default", "Personal"]);
  });

  test("offers nothing for a CLI that signs in through its own login", () => {
    expect(listStandaloneCliAccountOptions({ tabId: "cursor", profiles })).toEqual([]);
    expect(listStandaloneCliAccountOptions({ tabId: "kiro", profiles })).toEqual([]);
  });
});

// renderToStaticMarkup is a server render, and zustand v5 hands React the
// store's initial snapshot there, so these renders always see the built-in
// "System default" profiles. Which profiles a tab offers is covered by
// listStandaloneCliAccountOptions above.
describe("StandaloneCliAccountSelect", () => {
  const globalWithWindow = globalThis as { window?: unknown };
  let previousWindow: unknown;

  beforeEach(() => {
    previousWindow = globalWithWindow.window;
    globalWithWindow.window = { api: { providerAccounts: {} } };
  });

  afterEach(() => {
    if (previousWindow === undefined) {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = previousWindow;
    }
  });

  function render(props: Parameters<typeof StandaloneCliAccountSelect>[0]) {
    return renderToStaticMarkup(
      createElement(TooltipProvider, null, createElement(StandaloneCliAccountSelect, props)),
    );
  }

  test("shows the account the active tab runs under", () => {
    const markup = render({ tabId: "claude-code", value: "system-default", onValueChange: () => {} });

    expect(markup).toContain('aria-label="Claude Code account for this tab"');
    expect(markup).toContain("System default");
    expect(markup).not.toContain("Account unavailable");
  });

  test("names a pinned account that no longer exists instead of guessing", () => {
    const markup = render({ tabId: "codex", value: "codex-removed", onValueChange: () => {} });

    expect(markup).toContain("Account unavailable");
  });

  test("renders nothing for Cursor and Kiro", () => {
    expect(render({ tabId: "cursor", value: "system-default", onValueChange: () => {} })).toBe("");
    expect(render({ tabId: "kiro", value: "system-default", onValueChange: () => {} })).toBe("");
  });

  test("renders nothing without the account bridge", () => {
    globalWithWindow.window = { api: {} };

    expect(render({ tabId: "claude-code", value: "system-default", onValueChange: () => {} })).toBe("");
  });
});
