import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import { AccountsSection } from "@/components/layout/settings-dialog-accounts-section";
import { ToolingSection } from "@/components/layout/settings-dialog-tooling-section";
import { AccountsGettingStartedCardView, AccountsGettingStartedWelcomeView } from "@/components/layout/AccountsGettingStarted";
import { ApiConnectionForm } from "@/components/layout/ApiConnectionForm";
import { buildAccountsOnboardingChecklist, type AccountsOnboardingInput } from "@/lib/providers/accounts-onboarding";

// A server render hands React each store's initial snapshot (zustand v5), so
// state-dependent parts render through their views with built inputs; the
// connected forms are exercised in tests/e2e/accounts-settings.e2e.ts.
const host = globalThis as unknown as { window?: { api?: unknown } };
const originalWindow = host.window;
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const render = (node: ReactNode) => text(renderToStaticMarkup(createElement(TooltipProvider, null, node)));
/** Each part appears after the one before it. */
const inOrder = (html: string, parts: string[]) => {
  let from = 0;
  for (const part of parts) {
    const at = html.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
};

function checklist(overrides: Partial<AccountsOnboardingInput> & { providers?: Partial<AccountsOnboardingInput["providers"]> } = {}) {
  return buildAccountsOnboardingChecklist({
    extraAccountCount: 0,
    connectionCount: 0,
    workspaceOpen: true,
    skipped: [],
    ...overrides,
    providers: {
      "claude-code": { installed: false, signedIn: false },
      codex: { installed: false, signedIn: false },
      ...overrides.providers,
    },
  });
}

beforeEach(() => {
  host.window = {
    ...originalWindow,
    api: {
      providerAccounts: { list: async () => ({ ok: true, profiles: [] }) },
      apiConnections: { list: async () => ({ ok: true, connections: [] }) },
      secrets: { list: async () => ({ ok: true, secrets: [] }) },
    },
  };
});
afterEach(() => {
  host.window = originalWindow;
});

describe("Settings > Accounts", () => {
  test("top to bottom: Getting started, ways to pay, provider accounts, CLI-managed sign-in, API connections, help", () => {
    const html = render(createElement(AccountsSection));
    expect(inOrder(html, [
      "Getting started",
      "Choose how you pay",
      "Use your subscription",
      "Add another subscription",
      "Use a company gateway key",
      "Claude accounts",
      "Codex accounts",
      "Cursor, Kiro and OpenCode sign-in",
      "API connections",
      "Add a connection",
      "How accounts, subscriptions and gateway keys work",
    ])).toBe(true);
    // The account cards keep their own controls in the new place.
    expect(html).toContain("Add and sign in");
    expect(html).toContain("Advanced: reuse a folder you already use");
  });

  test("Tooling keeps CLI status and points accounts to their new place", () => {
    const html = render(createElement(ToolingSection, { onNavigateSection: () => {} }));
    expect(html).toContain("Accounts and API connections moved to Settings > Accounts.");
    expect(html).toContain("Open Accounts");
    expect(html).toContain("Native Tooling Status");
    expect(html).not.toContain("Claude accounts");
    expect(html).not.toContain("Add a connection");
  });
});

describe("Getting started card", () => {
  const props = { collapsed: false, onCollapsedChange: () => {}, onSkip: () => {} };

  test("nothing installed: copy an install command, sign-in waits", () => {
    const html = render(createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist() }));
    expect(html).toContain("Copy Claude Code install command");
    expect(html).toContain("npm install -g @anthropic-ai/claude-code");
    expect(html).toContain("Install a CLI first.");
    expect(html).not.toContain("Sign in to Claude Code");
  });

  test("CLI only: one sign-in button for the installed provider; without a workspace, open a repository", () => {
    const codexOnly = { providers: { codex: { installed: true, signedIn: false } } };
    const html = render(createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist(codexOnly) }));
    expect(html).toContain("Found Codex.");
    expect(html).toContain("Sign in to Codex");
    expect(html).not.toContain("Copy Codex install command");
    const noWorkspace = render(createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist({ ...codexOnly, workspaceOpen: false }) }));
    expect(noWorkspace).toContain("The sign-in terminal runs in a workspace. Open a repository first.");
    expect(noWorkspace).toContain("Open a repository");
    expect(noWorkspace).not.toContain("Sign in to Codex");
  });

  test("signed in with a connection: optional steps offer skip, the model step opens the selector", () => {
    const html = render(createElement(AccountsGettingStartedCardView, {
      ...props,
      checklist: checklist({ providers: { "claude-code": { installed: true, signedIn: true } }, connectionCount: 1, skipped: ["accounts"] }),
    }));
    expect(html).toContain("Ready to take turns: Claude Code.");
    expect(html).toContain("An API connection is set up.");
    expect(html).toContain("Undo skip");
    expect(html).toContain("Open the model selector");
  });

  test("folded, it is one line", () => {
    const done = checklist({ providers: { "claude-code": { installed: true, signedIn: true } }, extraAccountCount: 1, connectionCount: 1 });
    const html = render(createElement(AccountsGettingStartedCardView, { ...props, collapsed: true, checklist: done }));
    expect(html).toContain("Setup is complete. Ready to take turns: Claude Code.");
    expect(html).toContain("Show steps");
    expect(html).not.toContain("Pick a model");
    const left = render(createElement(AccountsGettingStartedCardView, { ...props, collapsed: true, checklist: checklist() }));
    expect(left).toContain("5 steps left.");
  });
});

describe("welcome Getting started", () => {
  const fallback = createElement("p", null, "original accounts sentence");

  test("replaces the accounts sentence while no provider can take a turn", () => {
    const html = render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: checklist() }));
    expect(html).toContain("No provider can take a turn yet.");
    expect(inOrder(html, ["1. Install the Claude Code or Codex CLI", "2. Sign in", "5. Pick a model"])).toBe(true);
    expect(html).not.toContain("Add another account");
    expect(html).toContain("Open Accounts");
    expect(html).not.toContain("original accounts sentence");
  });

  test("keeps the sentence until a check answered, and once a provider is ready", () => {
    const unknown = checklist({ providers: { "claude-code": { installed: null, signedIn: false }, codex: { installed: null, signedIn: false } } });
    expect(render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: unknown }))).toContain("original accounts sentence");
    const ready = checklist({ providers: { "claude-code": { installed: true, signedIn: true } } });
    expect(render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: ready }))).toContain("original accounts sentence");
  });
});

describe("API connection form", () => {
  test("the form offers a pasted key and shows its steps in order", () => {
    const html = render(createElement(ApiConnectionForm, { busy: false, secrets: [], onRefreshSecrets: () => {}, onCreate: async () => false }));
    expect(html).toContain("Paste a new key");
    expect(inOrder(html, ["API key", "Name", "Pinned models", "1 Key", "2 Name", "3 Models", "4 Check after adding", "Add connection"])).toBe(true);
    // The step line replaces the old "Still needed" list.
    expect(html).not.toContain("Still needed");
  });
});
