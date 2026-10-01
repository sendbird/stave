import type { CliSessionCreateSessionArgs } from "../../src/lib/terminal/types";
import { selectedProviderAccount } from "../../src/lib/providers/provider-account-selection";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../../src/lib/providers/provider-accounts";
import { getProviderAccountRegistry } from "../provider-accounts/registry";

/** Validate before reusing a live slot, including after profile removal. */
export function resolveCliAccountIdentity(args: Pick<CliSessionCreateSessionArgs, "providerId" | "runtimeOptions">) {
  const profileId = selectedProviderAccount(args.providerId, args.runtimeOptions);
  if (profileId !== SYSTEM_ACCOUNT_PROFILE_ID && (args.providerId === "claude-code" || args.providerId === "codex")) {
    getProviderAccountRegistry().resolveDirectory({ providerId: args.providerId, profileId });
  }
  return JSON.stringify([args.providerId, profileId]);
}
