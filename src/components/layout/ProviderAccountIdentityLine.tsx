import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { describeProviderAccountIdentity } from "@/lib/providers/provider-account-identity";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import {
  useProviderAccountIdentities,
  useProviderAccountIdentity,
} from "@/lib/providers/use-provider-account-identity";
import { accountStyles as styles } from "./provider-accounts.styles";

/**
 * "Signed in as <email> · <plan>" under an account's name. Not drawn for an API
 * connection, which has no sign-in. While the sign-in terminal for this account
 * is open the line waits instead of reporting a state that is about to change.
 */
export function ProviderAccountIdentityLine(props: {
  profile: ProviderAccountProfile;
  providerName: string;
  signingIn: boolean;
}) {
  const { profile } = props;
  const identity = useProviderAccountIdentity(profile.providerId, profile.id, !props.signingIn);
  const line = props.signingIn
    ? { text: "Signing in…", tone: "quiet" as const }
    : describeProviderAccountIdentity(identity, props.providerName);
  const canCheckAgain = !props.signingIn && (identity?.state === "unknown" || identity?.state === "signed-out");
  return (
    <div className={sx(styles.identityRow)}>
      <span role="status" className={sx(line.tone === "attention" ? styles.attention : styles.muted)}>
        {line.text}
      </span>
      {canCheckAgain && (
        <Button
          size="sm"
          variant="quiet"
          onClick={() =>
            void useProviderAccountIdentities
              .getState()
              .load({ providerId: profile.providerId, profileId: profile.id, refresh: true })
          }
        >
          Check again
        </Button>
      )}
    </div>
  );
}
