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

export type AccountsOnboardingProviderId = "claude-code" | "codex";

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
  /** Steps 1 and 2 are done: at least one provider can take a turn. */
  ready: boolean;
  /** Every step is done or skipped. */
  complete: boolean;
  /** Whether any CLI check has answered; until then nothing is claimed. */
  known: boolean;
  /** The installed provider the sign-in button opens, Claude first. */
  signInProviderId: AccountsOnboardingProviderId | null;
  /** The provider the add-an-account button targets: an installed one, Claude first. */
  addAccountProviderId: AccountsOnboardingProviderId;
  /** The sign-in step needs a workspace before its button can work. */
  signInNeedsWorkspace: boolean;
  installedProviderIds: AccountsOnboardingProviderId[];
  signedInProviderIds: AccountsOnboardingProviderId[];
  /** The composer, and so its model selector, exists only with a workspace open. */
  workspaceOpen: boolean;
  remainingCount: number;
}

const PROVIDER_ORDER: readonly AccountsOnboardingProviderId[] = ["claude-code", "codex"];

export function buildAccountsOnboardingChecklist(input: AccountsOnboardingInput): AccountsOnboardingChecklist {
  const states = PROVIDER_ORDER.map((id) => ({ id, ...input.providers[id] }));
  const known = states.some((state) => state.installed !== null);
  const installed = states.filter((state) => state.installed === true);
  const installDone = installed.length > 0;
  const signedIn = states.some((state) => state.signedIn);
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
  return {
    steps,
    ready,
    complete: steps.every((step) => settled(step.status)),
    known,
    signInProviderId: installed.find((state) => !state.signedIn)?.id ?? null,
    addAccountProviderId: installed[0]?.id ?? "claude-code",
    signInNeedsWorkspace: signIn === "todo" && !input.workspaceOpen,
    installedProviderIds: installed.map((state) => state.id),
    signedInProviderIds: states.filter((state) => state.signedIn).map((state) => state.id),
    workspaceOpen: input.workspaceOpen,
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
export const PROVIDER_CLI_INSTALL_COMMAND: Record<AccountsOnboardingProviderId, string> = {
  "claude-code": "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
};
