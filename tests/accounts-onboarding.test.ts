import { describe, expect, test } from "bun:test";
import {
  buildAccountsOnboardingChecklist,
  isAccountsOnboardingCollapsed,
  normalizeAccountsOnboarding,
  toggleAccountsOnboardingSkip,
  type AccountsOnboardingInput,
} from "@/lib/providers/accounts-onboarding";
import {
  accountsFocusElementId,
  apiConnectionFieldId,
  apiConnectionIdFromFocus,
  signInProviderFromFocus,
} from "@/lib/providers/accounts-guide";

const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

function input(overrides: Partial<AccountsOnboardingInput> & { providers?: Partial<AccountsOnboardingInput["providers"]> } = {}): AccountsOnboardingInput {
  return {
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
  };
}

const statuses = (checklist: ReturnType<typeof buildAccountsOnboardingChecklist>) =>
  Object.fromEntries(checklist.steps.map((step) => [step.id, step.status]));

describe("Getting started checklist", () => {
  test("claims nothing before a CLI check answered", () => {
    const checklist = buildAccountsOnboardingChecklist(input({
      providers: { "claude-code": { installed: null, signedIn: false }, codex: { installed: null, signedIn: false } },
    }));
    expect(checklist.known).toBe(false);
    expect(statuses(checklist)).toMatchObject({ install: "checking", signIn: "checking", model: "blocked" });
  });

  test("nothing installed: install is the step, sign-in waits for it", () => {
    const checklist = buildAccountsOnboardingChecklist(input());
    expect(checklist.known).toBe(true);
    expect(statuses(checklist)).toEqual({ install: "todo", signIn: "blocked", accounts: "todo", gateway: "todo", model: "blocked" });
    expect(checklist.ready).toBe(false);
    expect(checklist.signInProviderId).toBeNull();
  });

  test("CLI only: sign in to the installed provider, in a workspace", () => {
    const checklist = buildAccountsOnboardingChecklist(input({ providers: { codex: { installed: true, signedIn: false } } }));
    expect(statuses(checklist)).toMatchObject({ install: "done", signIn: "todo", model: "blocked" });
    expect(checklist.signInProviderId).toBe("codex");
    expect(checklist.addAccountProviderId).toBe("codex");
    expect(checklist.signInNeedsWorkspace).toBe(false);
    const noWorkspace = buildAccountsOnboardingChecklist(input({ workspaceOpen: false, providers: { codex: { installed: true, signedIn: false } } }));
    expect(noWorkspace.signInNeedsWorkspace).toBe(true);
  });

  test("signed in: ready, the model step is done, optional steps remain", () => {
    const checklist = buildAccountsOnboardingChecklist(input({
      providers: { "claude-code": { installed: true, signedIn: true }, codex: { installed: true, signedIn: false } },
    }));
    expect(checklist.ready).toBe(true);
    expect(checklist.complete).toBe(false);
    expect(statuses(checklist)).toMatchObject({ install: "done", signIn: "done", accounts: "todo", gateway: "todo", model: "done" });
    // Codex is installed but not signed in, so the sign-in button still has a target.
    expect(checklist.signInProviderId).toBe("codex");
    expect(checklist.signedInProviderIds).toEqual(["claude-code"]);
    expect(checklist.remainingCount).toBe(2);
  });

  test("a connection counts for the gateway step; skipped steps settle the checklist", () => {
    const signedIn = { "claude-code": { installed: true, signedIn: true } };
    const withConnection = buildAccountsOnboardingChecklist(input({ providers: signedIn, connectionCount: 1 }));
    expect(statuses(withConnection).gateway).toBe("done");
    expect(withConnection.complete).toBe(false);
    const skipped = buildAccountsOnboardingChecklist(input({ providers: signedIn, connectionCount: 1, skipped: ["accounts"] }));
    expect(statuses(skipped).accounts).toBe("skipped");
    expect(skipped.complete).toBe(true);
    expect(skipped.remainingCount).toBe(0);
  });

  test("folds once complete unless the person chose otherwise", () => {
    const done = buildAccountsOnboardingChecklist(input({
      providers: { "claude-code": { installed: true, signedIn: true } },
      extraAccountCount: 1,
      connectionCount: 1,
    }));
    const open = buildAccountsOnboardingChecklist(input());
    expect(isAccountsOnboardingCollapsed(done, null)).toBe(true);
    expect(isAccountsOnboardingCollapsed(open, null)).toBe(false);
    expect(isAccountsOnboardingCollapsed(done, false)).toBe(false);
    expect(isAccountsOnboardingCollapsed(open, true)).toBe(true);
  });

  test("skips toggle without duplicates, and stored values normalize", () => {
    const once = toggleAccountsOnboardingSkip({ collapsed: null, skipped: [] }, "gateway", true);
    expect(toggleAccountsOnboardingSkip(once, "gateway", true).skipped).toEqual(["gateway"]);
    expect(toggleAccountsOnboardingSkip(once, "gateway", false).skipped).toEqual([]);
    expect(normalizeAccountsOnboarding({ collapsed: true, skipped: ["gateway", "bogus", "accounts"] })).toEqual({ collapsed: true, skipped: ["accounts", "gateway"] });
    expect(normalizeAccountsOnboarding(undefined)).toEqual({ collapsed: null, skipped: [] });
    expect(normalizeAccountsOnboarding({ collapsed: "yes", skipped: "gateway" })).toEqual({ collapsed: null, skipped: [] });
  });
});

describe("Settings > Accounts deep links", () => {
  test("each focus names one element; unknown targets name none", () => {
    expect(accountsFocusElementId("claude-code")).toBe("settings-field-claude-accounts");
    expect(accountsFocusElementId("codex-add")).toBe("settings-field-codex-accounts-add");
    expect(accountsFocusElementId("claude-code-signin")).toBe("settings-field-claude-accounts");
    expect(accountsFocusElementId("api-connections")).toBe("settings-field-api-connections");
    expect(accountsFocusElementId("api-connection-new")).toBe("settings-field-api-connection-new");
    expect(accountsFocusElementId(`api-connection:${CONNECTION_ID}`)).toBe(apiConnectionFieldId(CONNECTION_ID));
    expect(accountsFocusElementId("api-connection:")).toBeNull();
    expect(accountsFocusElementId("nowhere")).toBeNull();
    expect(accountsFocusElementId(null)).toBeNull();
  });

  test("a connection focus and a sign-in focus are recognized by their owners", () => {
    expect(apiConnectionIdFromFocus(`api-connection:${CONNECTION_ID}`)).toBe(CONNECTION_ID);
    expect(apiConnectionIdFromFocus("api-connection-new")).toBeNull();
    expect(signInProviderFromFocus("codex-signin")).toBe("codex");
    expect(signInProviderFromFocus("codex")).toBeNull();
  });
});
