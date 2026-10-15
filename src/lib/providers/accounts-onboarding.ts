/**
 * The Getting started checklist in Settings > Accounts and on the welcome
 * screen. Pure: the inputs come from the provider readiness, account and
 * identity stores, so every state can be tested without a bridge.
 */

export const ACCOUNTS_ONBOARDING_SKIPPABLE_STEPS = ["accounts", "gateway"] as const;
export type AccountsOnboardingSkippableStep = (typeof ACCOUNTS_ONBOARDING_SKIPPABLE_STEPS)[number];

export interface AccountsOnboardingSettings {
  /** null follows the checklist: open while work remains, folded once it is done. */
  collapsed: boolean | null;
  skipped: AccountsOnboardingSkippableStep[];
}

export const DEFAULT_ACCOUNTS_ONBOARDING: AccountsOnboardingSettings = { collapsed: null, skipped: [] };

export function normalizeAccountsOnboarding(raw: unknown): AccountsOnboardingSettings {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const skipped = Array.isArray(value.skipped)
    ? ACCOUNTS_ONBOARDING_SKIPPABLE_STEPS.filter((step) => (value.skipped as unknown[]).includes(step))
    : [];
  return {
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : null,
    skipped,
  };
}

/**
 * Every provider counts toward "can take a turn". Claude Code and Codex sign
 * in through Stave's terminal and have accounts; Cursor, Kiro and OpenCode
 * keep their own CLI sign-in, which Settings > Accounts reports.
 */
export const ACCOUNTS_ONBOARDING_PROVIDERS = ["claude-code", "codex", "cursor", "kiro", "opencode"] as const;
export type AccountsOnboardingProviderId = (typeof ACCOUNTS_ONBOARDING_PROVIDERS)[number];
/** The providers with Stave-managed sign-in accounts. */
export type AccountsOnboardingAccountProviderId = "claude-code" | "codex";
export type CliManagedProviderId = Exclude<AccountsOnboardingProviderId, AccountsOnboardingAccountProviderId>;

export function isCliManagedProvider(providerId: string): providerId is CliManagedProviderId {
  return providerId === "cursor" || providerId === "kiro" || providerId === "opencode";
}

export interface AccountsOnboardingProviderState {
  /** Whether the CLI was found; null until a check answered. */
  installed: boolean | null;
  /** The provider can take a turn: signed in, or its selected API connection's key is readable. */
  signedIn: boolean;
}

export interface AccountsOnboardingInput {
  providers: Record<AccountsOnboardingProviderId, AccountsOnboardingProviderState>;
  /** Sign-in accounts beyond System default, across Claude and Codex. */
  extraAccountCount: number;
  connectionCount: number;
  /** The sign-in terminal runs in a workspace, so one must be open. */
  workspaceOpen: boolean;
  /** A task's composer is mounted and can open its model selector. */
  composerOpen: boolean;
  skipped: readonly AccountsOnboardingSkippableStep[];
}

export type AccountsOnboardingStepId = "install" | "signIn" | "accounts" | "gateway" | "model";
/**
 * - `checking`: no answer yet from the CLI check.
 * - `blocked`: waits for an earlier step.
 */
export type AccountsOnboardingStepStatus = "done" | "todo" | "skipped" | "blocked" | "checking";

export interface AccountsOnboardingStep {
  id: AccountsOnboardingStepId;
  status: AccountsOnboardingStepStatus;
  optional: boolean;
}

export interface AccountsOnboardingChecklist {
  steps: AccountsOnboardingStep[];
  /** Steps 1 and 2 are done: at least one provider has its CLI installed and a working sign-in. */
  ready: boolean;
  /** Every step is done or skipped. */
  complete: boolean;
  /** Whether any CLI check has answered; until then nothing is claimed. */
  known: boolean;
  /** The installed provider the sign-in button opens: Claude, Codex, then the CLI-managed ones. */
  signInProviderId: AccountsOnboardingProviderId | null;
  /** The provider the add-an-account button targets: an installed one with accounts, Claude first. */
  addAccountProviderId: AccountsOnboardingAccountProviderId;
  /** The sign-in step needs a workspace before its button can work. */
  signInNeedsWorkspace: boolean;
  installedProviderIds: AccountsOnboardingProviderId[];
  /** Providers that can take a turn: their CLI is installed and their sign-in works. */
  signedInProviderIds: AccountsOnboardingProviderId[];
  /** The composer, and so its model selector, exists only with a workspace open. */
  workspaceOpen: boolean;
  /**
   * What the model step still needs before its button can open the selector:
   * a repository (no workspace), or a task (a workspace with no composer open).
   */
  modelNeeds: "repository" | "task" | null;
  remainingCount: number;
}

export function buildAccountsOnboardingChecklist(input: AccountsOnboardingInput): AccountsOnboardingChecklist {
  const states = ACCOUNTS_ONBOARDING_PROVIDERS.map((id) => ({ id, ...input.providers[id] }));
  const known = states.some((state) => state.installed !== null);
  const installed = states.filter((state) => state.installed === true);
  const installDone = installed.length > 0;
  // Ready is per provider: its own CLI is installed and its own sign-in (or
  // selected API connection) works. Claude's cached sign-in and Codex's CLI do
  // not add up to a provider that can take a turn.
  const readyStates = installed.filter((state) => state.signedIn);
  const signedIn = readyStates.length > 0;
  const install: AccountsOnboardingStepStatus = installDone ? "done" : known ? "todo" : "checking";
  const signIn: AccountsOnboardingStepStatus = signedIn
    ? "done"
    : installDone
      ? "todo"
      : known
        ? "blocked"
        : "checking";
  const ready = install === "done" && signIn === "done";
  const optionalStatus = (step: AccountsOnboardingSkippableStep, done: boolean): AccountsOnboardingStepStatus =>
    done ? "done" : input.skipped.includes(step) ? "skipped" : "todo";
  const steps: AccountsOnboardingStep[] = [
    { id: "install", status: install, optional: false },
    { id: "signIn", status: signIn, optional: false },
    { id: "accounts", status: optionalStatus("accounts", input.extraAccountCount > 0), optional: true },
    { id: "gateway", status: optionalStatus("gateway", input.connectionCount > 0), optional: true },
    { id: "model", status: ready ? "done" : "blocked", optional: false },
  ];
  const settled = (status: AccountsOnboardingStepStatus) => status === "done" || status === "skipped";
  const signInProviderId = installed.find((state) => !state.signedIn)?.id ?? null;
  const accountProvider = installed.find((state) => !isCliManagedProvider(state.id))?.id;
  return {
    steps,
    ready,
    complete: steps.every((step) => settled(step.status)),
    known,
    signInProviderId,
    addAccountProviderId: accountProvider === "codex" ? "codex" : "claude-code",
    // Only Stave's sign-in terminal needs a workspace; a CLI-managed sign-in runs in the person's own terminal.
    signInNeedsWorkspace: signIn === "todo" && !input.workspaceOpen && signInProviderId !== null && !isCliManagedProvider(signInProviderId),
    installedProviderIds: installed.map((state) => state.id),
    signedInProviderIds: readyStates.map((state) => state.id),
    workspaceOpen: input.workspaceOpen,
    modelNeeds: input.composerOpen ? null : input.workspaceOpen ? "task" : "repository",
    remainingCount: steps.filter((step) => !settled(step.status)).length,
  };
}

/** Open while work remains, unless the user folded or unfolded it themselves. */
export function isAccountsOnboardingCollapsed(checklist: AccountsOnboardingChecklist, collapsed: boolean | null) {
  return collapsed ?? checklist.complete;
}

export function toggleAccountsOnboardingSkip(
  settings: AccountsOnboardingSettings,
  step: AccountsOnboardingSkippableStep,
  skip: boolean,
): AccountsOnboardingSettings {
  const others = settings.skipped.filter((entry) => entry !== step);
  return { ...settings, skipped: skip ? [...others, step] : others };
}

/** npm installs for the two CLIs Stave signs in with; copied, never run by Stave. */
export const PROVIDER_CLI_INSTALL_COMMAND: Record<AccountsOnboardingAccountProviderId, string> = {
  "claude-code": "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
};
