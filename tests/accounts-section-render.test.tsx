import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { TooltipProvider } from "@/components/ui";
import { AccountsSection } from "@/components/layout/settings-dialog-accounts-section";
import { ToolingSection } from "@/components/layout/settings-dialog-tooling-section";
import { AccountsGettingStartedCardView, AccountsGettingStartedWelcomeView } from "@/components/layout/AccountsGettingStarted";
import { ApiConnectionForm } from "@/components/layout/ApiConnectionForm";
import { ApiConnectionNextStep } from "@/components/layout/ApiConnectionsSettings";
import { VERCEL_AI_GATEWAY } from "@/lib/providers/api-connections";
import { ModelPickerAccountFooterView } from "@/components/ai-elements/model-picker-account-actions";
import { buildAccountsOnboardingChecklist, type AccountsOnboardingInput } from "@/lib/providers/accounts-onboarding";
import { resolveProviderAccountBlocker } from "@/lib/providers/provider-account-blocker";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import { useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";

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
    composerOpen: true,
    skipped: [],
    ...overrides,
    providers: {
      "claude-code": { installed: false, signedIn: false },
      codex: { installed: false, signedIn: false },
      cursor: { installed: false, signedIn: false },
      kiro: { installed: false, signedIn: false },
      opencode: { installed: false, signedIn: false },
      ...overrides.providers,
    },
  });
}

function tool(id: ToolingStatusEntry["id"], authState: ToolingStatusEntry["authState"]): ToolingStatusEntry {
  return { id, label: id, state: "ready", available: true, summary: "", detail: "", version: null, executablePath: null, authState, authDetail: null };
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
      "Other agent CLIs",
      "API connections",
      "Add a connection",
      "How accounts, subscriptions and gateway keys work",
    ])).toBe(true);
    // The account cards keep their own controls in the new place.
    expect(html).toContain("Add and sign in");
    expect(html).toContain("Advanced: reuse a folder you already use");
  });

  test("CLI-managed sign-in: one quiet checking row until the first check answers", () => {
    const raw = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsSection)));
    expect(raw).toContain("data-cli-checking");
    expect(raw).not.toContain("data-cli-provider");
    expect(raw).not.toContain("data-cli-missing");
    expect(text(raw)).toContain("Cursor Agent, Kiro CLI, and OpenCode Checking");
  });

  test("CLI-managed sign-in: installed CLIs keep a row, missing ones fold into one row with a path field", () => {
    const readinessInitial = useProviderReadinessStore.getInitialState();
    const previous = readinessInitial.providers;
    const entry = (value: ToolingStatusEntry) => ({ tool: value, configurationKey: "", checkedAt: 1, generation: 1, stale: false });
    readinessInitial.providers = {
      cursor: entry({ ...tool("cursor", "unknown"), state: "warning", available: false }),
      kiro: entry({ ...tool("kiro", "unauthenticated"), state: "warning" }),
      opencode: entry(tool("opencode", "not-required")),
    };
    try {
      const raw = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsSection)));
      const html = text(raw);
      // A signed-out CLI keeps its full row: that row is where sign-in starts.
      expect(raw).toContain('data-cli-provider="kiro"');
      expect(raw).toContain('data-cli-provider="opencode"');
      expect(html).toContain("Kiro CLI Login Required");
      expect(html).toContain("Copy Login Command");
      // The CLI that was not found is one folded row whose panel can point Stave at it.
      expect(raw).toContain("data-cli-missing");
      expect(raw).not.toContain("data-cli-checking");
      expect(html).toContain("Not installed: Cursor Agent");
      expect(html).toContain("Install Cursor Agent to use it.");
      expect(raw).toContain('aria-label="Cursor Agent path"');
      expect(raw).toContain('placeholder="agent"');
    } finally {
      readinessInitial.providers = previous;
    }
  });

  test("CLI-managed sign-in: an installed CLI without a provider tab keeps its path in a closed disclosure", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const appInitial = useAppStore.getInitialState();
    const readinessInitial = useProviderReadinessStore.getInitialState();
    const previousAvailability = appInitial.providerAvailability;
    const previous = readinessInitial.providers;
    const entry = (value: ToolingStatusEntry) => ({ tool: value, configurationKey: "", checkedAt: 1, generation: 1, stale: false });
    appInitial.providerAvailability = { ...previousAvailability, kiro: true, opencode: true };
    readinessInitial.providers = {
      cursor: entry({ ...tool("cursor", "unknown"), state: "warning", available: false }),
      kiro: entry({ ...tool("kiro", "unauthenticated"), state: "warning" }),
      opencode: entry(tool("opencode", "not-required")),
    };
    try {
      const raw = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsSection)));
      // Kiro is installed but signed out, so its provider tab (and the path there) is hidden.
      const kiroPath = raw.indexOf('data-cli-path="kiro"');
      expect(kiroPath).toBeGreaterThan(-1);
      const panel = raw.slice(kiroPath);
      expect(panel).toContain('aria-label="Kiro CLI path"');
      expect(panel).toContain('placeholder="kiro-cli"');
      // The disclosure starts closed: its trigger is collapsed and its region hidden.
      const trigger = panel.slice(panel.indexOf("<button"), panel.indexOf("</button>"));
      expect(trigger).toContain('aria-expanded="false"');
      expect(trigger).toContain("CLI path");
      const regionAt = panel.indexOf('role="region"');
      expect(panel.slice(panel.slice(0, regionAt).lastIndexOf("<div"), regionAt)).toContain('hidden=""');
      // The path field is inside the row, so the row stays the only deep-link target.
      expect(raw.split('id="settings-field-cli-provider-kiro"').length).toBe(2);
      // OpenCode needs no Stave sign-in, so its tab shows and owns the path.
      expect(raw).not.toContain('data-cli-path="opencode"');
    } finally {
      appInitial.providerAvailability = previousAvailability;
      readinessInitial.providers = previous;
    }
  });

  test("CLI-managed sign-in: a signed-in CLI without a usable allowance says why it has no provider tab", () => {
    const readinessInitial = useProviderReadinessStore.getInitialState();
    const previous = readinessInitial.providers;
    const entry = (value: ToolingStatusEntry) => ({ tool: value, configurationKey: "", checkedAt: 1, generation: 1, stale: false });
    const reason = i18n.t("settingsProviders:toolingSection.accountAccess.unavailable", { label: "Kiro CLI" });
    readinessInitial.providers = {
      kiro: entry({ ...tool("kiro", "authenticated"), state: "warning", summary: reason }),
      opencode: entry(tool("opencode", "not-required")),
    };
    try {
      const raw = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsSection)));
      const row = raw.slice(raw.indexOf('data-cli-provider="kiro"'), raw.indexOf("</li>", raw.indexOf('data-cli-provider="kiro"')));
      expect(row).toContain("data-cli-access-issue");
      expect(text(row)).toContain(reason);
      expect(text(row)).toContain("Needs Attention");
      expect(text(row)).not.toContain("Authenticated");
      // A CLI that is ready keeps its plain sign-in row.
      expect(raw.split("data-cli-access-issue").length - 1).toBe(1);
    } finally {
      readinessInitial.providers = previous;
    }
  });

  test("Tooling shows CLI status only, without a pointer back to Accounts", () => {
    const html = render(createElement(ToolingSection));
    expect(html).not.toContain("moved to Settings > Accounts");
    expect(html).not.toContain("Open Accounts");
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

  test("a CLI that is not installed names itself once, in both languages", () => {
    for (const lng of ["en", "ko"]) {
      for (const name of ["Kiro CLI", "Cursor Agent", "OpenCode"]) {
        expect(i18n.t("settingsConnections:accountsSection.cliManaged.installHint", { value1: name, lng })).not.toContain("CLI CLI");
        expect(i18n.t("composer:accountNotice.cliMissing", { value1: name, lng })).not.toContain("CLI CLI");
      }
    }
  });

  test("a CLI-managed provider signs in through its own login, without a workspace", () => {
    const html = render(createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist({ workspaceOpen: false, providers: { cursor: { installed: true, signedIn: false } } }) }));
    expect(html).toContain("Cursor Agent keeps its own sign-in.");
    expect(html).toContain("How to sign in to Cursor Agent");
    expect(html).not.toContain("Open a repository");
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

  test("without a task's composer the model step's button is off and says to open a task", () => {
    const ready = { providers: { "claude-code": { installed: true, signedIn: true } } };
    const noTask = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist({ ...ready, composerOpen: false }) })));
    expect(noTask).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Open the model selector<\/span><\/button>/);
    expect(text(noTask)).toContain("Open a task first: the model selector is in its composer.");
    const withTask = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AccountsGettingStartedCardView, { ...props, checklist: checklist(ready) })));
    expect(withTask).not.toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Open the model selector<\/span><\/button>/);
    expect(text(withTask)).toContain("Choose a model in the composer's model selector.");
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
    expect(inOrder(html, ["Install a provider CLI", "Sign in", "Pick a model"])).toBe(true);
    // Title and status are one run with single spaces around the dot.
    expect(renderToStaticMarkup(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: checklist() }))).toContain("<span>Install a provider CLI · To do</span>");
    // Only the required steps are listed, so no checklist numbers (1, 2, 5) show.
    expect(html).not.toMatch(/\b[125]\. /);
    expect(html).not.toContain("Add another account");
    expect(html).toContain("Open Accounts");
    expect(html).not.toContain("original accounts sentence");
  });

  test("keeps the sentence until a check answered, and once a provider is ready", () => {
    const none = { installed: null, signedIn: false };
    const unknown = checklist({ providers: { "claude-code": none, codex: none, cursor: none, kiro: none, opencode: none } });
    expect(render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: unknown }))).toContain("original accounts sentence");
    const ready = checklist({ providers: { "claude-code": { installed: true, signedIn: true } } });
    expect(render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: ready }))).toContain("original accounts sentence");
    // OpenCode alone is a provider that can take a turn.
    const openCodeOnly = checklist({ providers: { opencode: { installed: true, signedIn: true } } });
    expect(render(createElement(AccountsGettingStartedWelcomeView, { fallback, checklist: openCodeOnly }))).toContain("original accounts sentence");
  });
});

describe("API connection form and model picker foot", () => {
  test("the form offers a pasted key and shows its steps in order", () => {
    const html = render(createElement(ApiConnectionForm, { busy: false, secrets: [], onRefreshSecrets: () => {}, onCreate: async () => false }));
    expect(html).toContain("Paste a new key");
    expect(inOrder(html, ["API key", "Name", "Pinned models", "1 Key", "2 Name", "3 Models", "4 Check after adding", "Add connection"])).toBe(true);
    // The step line replaces the old "Still needed" list.
    expect(html).not.toContain("Still needed");
  });

  test("after adding a connection, Use in Codex needs a workspace and says so", () => {
    // The server render reads the store's initial state, which has no workspace open.
    const html = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(ApiConnectionNextStep, {
      connection: {
        id: "44444444-4444-4444-8444-444444444444",
        label: "Company gateway",
        kind: "vercel-ai-gateway",
        secretId: "11111111-1111-4111-8111-111111111111",
        endpoints: { ...VERCEL_AI_GATEWAY.endpoints },
        models: [{ id: "moonshotai/kimi-k3" }],
      },
      busy: false,
      onDismiss: () => {},
    })));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Use in Codex<\/span><\/button>/);
    expect(text(html)).toContain("Open a repository first");
  });

  test("the picker foot names only set-up providers that stopped working, and how to fix them", () => {
    const signedOut = resolveProviderAccountBlocker({
      providerId: "codex",
      available: false,
      tool: tool("codex", "unauthenticated"),
      selectedProfile: { id: "system-default", kind: "system", label: "System default" },
      otherAccountCount: 0,
      limitReached: false,
    });
    const limited = resolveProviderAccountBlocker({
      providerId: "claude-code",
      available: true,
      tool: tool("claude", "authenticated"),
      selectedProfile: { id: "system-default", kind: "system", label: "System default" },
      otherAccountCount: 0,
      limitReached: true,
    });
    const kiroSignedOut = resolveProviderAccountBlocker({
      providerId: "kiro",
      available: false,
      tool: tool("kiro", "unauthenticated"),
      selectedProfile: undefined,
      otherAccountCount: 0,
      limitReached: false,
    });
    const notInstalled = (["claude-code", "cursor"] as const).map((providerId) => resolveProviderAccountBlocker({
      providerId,
      available: false,
      tool: { ...tool(providerId === "cursor" ? "cursor" : "claude", "unknown"), available: false },
      selectedProfile: providerId === "cursor" ? undefined : { id: "system-default", kind: "system", label: "System default" },
      otherAccountCount: 0,
      limitReached: false,
    }));
    expect(notInstalled.map((blocker) => blocker?.kind)).toEqual(["cli-missing", "cli-missing"]);
    const html = render(createElement(ModelPickerAccountFooterView, { blockers: [limited, signedOut, kiroSignedOut, ...notInstalled], hasConnection: false, onGo: () => {} }));
    expect(html).toContain("Codex is not signed in on System default.");
    expect(html).toContain("Kiro CLI is not signed in.");
    // A CLI that is not installed is left out, for every provider; so is a usage limit.
    expect(html).not.toContain("not installed");
    expect(html).not.toContain("Set up");
    expect(html).not.toContain("usage limit");
    expect(inOrder(html, ["Sign in", "Add other models with Vercel AI Gateway…", "Manage accounts and connections…"])).toBe(true);
    const withConnection = render(createElement(ModelPickerAccountFooterView, { blockers: [null, null], hasConnection: true, onGo: () => {} }));
    expect(withConnection).not.toContain("Add other models with Vercel AI Gateway…");
    expect(withConnection).toContain("Manage accounts and connections…");
  });
});
