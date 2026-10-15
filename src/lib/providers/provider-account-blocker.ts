import { i18n } from "@/i18n/runtime";
import type { ToolingStatusEntry } from "../tooling-status";
import { apiConnectionFocus, type AccountsSettingsFocus } from "./accounts-guide";
import { getProviderLabel } from "./model-catalog";
import type { ProviderAccountProfile } from "./provider-accounts";
import type { ProviderId } from "./provider.types";

/**
 * Why the selected Claude or Codex account cannot take a turn now:
 * - `cli-missing`: the CLI was not found.
 * - `signed-out`: the account's sign-in answered "not signed in".
 * - `key-unreadable`: the account is an API connection whose key Stave cannot read.
 * - `limit-reached`: included usage is at its limit and Stave stops new turns there.
 */
export type ProviderAccountBlockerKind = "cli-missing" | "signed-out" | "key-unreadable" | "limit-reached";

export interface ProviderAccountBlocker {
  kind: ProviderAccountBlockerKind;
  providerId: "claude-code" | "codex";
  /** The account new turns use, by its label. */
  accountLabel: string;
  /** Where the one button goes: a deep link into Settings > Accounts. */
  focus: AccountsSettingsFocus;
  /** `switch` when another account exists for this provider, so the action reads "Switch account". */
  action: "set-up" | "sign-in" | "connect-key" | "switch" | "add-account";
}

/**
 * Pure: the inputs are the provider's readiness for its selected account, its
 * availability, and its usage meter. Null while nothing has been checked, so
 * startup never shows a notice that the first check would retract.
 */
export function resolveProviderAccountBlocker(args: {
  providerId: ProviderId;
  available: boolean | undefined;
  tool: ToolingStatusEntry | undefined;
  selectedProfile: Pick<ProviderAccountProfile, "id" | "kind" | "label" | "gateway"> | undefined;
  /** Sign-in accounts and connections for this provider other than the selected one. */
  otherAccountCount: number;
  limitReached: boolean;
}): ProviderAccountBlocker | null {
  if (args.providerId !== "claude-code" && args.providerId !== "codex") return null;
  const providerId = args.providerId;
  const tool = args.tool;
  if (!tool) return null;
  const accountLabel = args.selectedProfile?.label ?? "";
  if (!tool.available) {
    return { kind: "cli-missing", providerId, accountLabel, focus: "getting-started", action: "set-up" };
  }
  const gateway = args.selectedProfile?.gateway;
  if (gateway && args.available === false && args.selectedProfile) {
    return { kind: "key-unreadable", providerId, accountLabel, focus: apiConnectionFocus(args.selectedProfile.id), action: "connect-key" };
  }
  if (!gateway && tool.authState === "unauthenticated") {
    // System default signs in from Getting started's flow; another account from its own row.
    const focus: AccountsSettingsFocus = args.selectedProfile && args.selectedProfile.kind !== "system" ? providerId : `${providerId}-signin`;
    return { kind: "signed-out", providerId, accountLabel, focus, action: "sign-in" };
  }
  if (args.limitReached) {
    return args.otherAccountCount > 0
      ? { kind: "limit-reached", providerId, accountLabel, focus: providerId, action: "switch" }
      : { kind: "limit-reached", providerId, accountLabel, focus: `${providerId}-add`, action: "add-account" };
  }
  return null;
}

export function describeProviderAccountBlocker(blocker: ProviderAccountBlocker) {
  const provider = getProviderLabel({ providerId: blocker.providerId, variant: "full" });
  switch (blocker.kind) {
    case "cli-missing":
      return i18n.t("composer:accountNotice.cliMissing", { value1: provider });
    case "signed-out":
      return i18n.t("composer:accountNotice.signedOut", { value1: provider, value2: blocker.accountLabel });
    case "key-unreadable":
      return i18n.t("composer:accountNotice.keyUnreadable", { value1: blocker.accountLabel });
    case "limit-reached":
      return i18n.t("composer:accountNotice.limitReached", { value1: provider, value2: blocker.accountLabel });
  }
}

export function providerAccountBlockerActionLabel(blocker: ProviderAccountBlocker) {
  switch (blocker.action) {
    case "set-up": return i18n.t("composer:accountNotice.actions.setUp");
    case "sign-in": return i18n.t("composer:accountNotice.actions.signIn");
    case "connect-key": return i18n.t("composer:accountNotice.actions.connectKey");
    case "switch": return i18n.t("composer:accountNotice.actions.switchAccount");
    case "add-account": return i18n.t("composer:accountNotice.actions.addAccount");
  }
}
