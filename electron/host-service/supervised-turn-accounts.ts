import { snapshotProviderAccounts, type ProviderAccountSelection } from "../../src/lib/providers/provider-account-selection";

/** Explicit turn accounts win; automatic follow-ups resume the task's captured accounts. */
export function resolveSupervisedTurnAccounts(explicit: ProviderAccountSelection | undefined, saved: ProviderAccountSelection | undefined) {
  return snapshotProviderAccounts({
    claudeAccountProfileId: explicit?.claudeAccountProfileId ?? saved?.claudeAccountProfileId,
    codexAccountProfileId: explicit?.codexAccountProfileId ?? saved?.codexAccountProfileId,
  });
}
