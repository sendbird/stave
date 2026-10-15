import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import {
  canProbeTurnAccount,
  describeTurnAccountDetail,
  type TurnAccountRef,
} from "@/lib/providers/turn-account";
import { useProviderAccountIdentity } from "@/lib/providers/use-provider-account-identity";

/**
 * Tooltip body for a turn's model notation: the model line, then the account
 * the turn ran on and who that account is signed in as.
 *
 * Mounted only while the tooltip is open, so the sign-in probe runs for the
 * row the reader is looking at instead of for every turn in the transcript.
 */
export function TurnModelTooltip(props: {
  modelLabel: string;
  account?: {
    ref: TurnAccountRef;
    profile: ProviderAccountProfile | undefined;
  };
}) {
  return (
    <span className={sx(styles.body)}>
      <span>{props.modelLabel}</span>
      {props.account ? (
        <TurnAccountLines
          accountRef={props.account.ref}
          profile={props.account.profile}
        />
      ) : null}
    </span>
  );
}

function TurnAccountLines(props: {
  accountRef: TurnAccountRef;
  profile: ProviderAccountProfile | undefined;
}) {
  const { t } = useTranslation(["providers"]);
  const identity = useProviderAccountIdentity(
    props.accountRef.providerId,
    props.accountRef.profileId,
    canProbeTurnAccount(props.profile),
  );
  const name =
    props.profile?.label ?? t("providers:turnModelInfo.removedAccount");
  const detail = describeTurnAccountDetail(props.profile, identity);
  return (
    <>
      <span data-turn-account-name="true">
        {t("providers:turnModelInfo.account", { name })}
      </span>
      {detail ? (
        <span data-turn-account-detail="true" className={sx(styles.detail)}>
          {detail}
        </span>
      ) : null}
    </>
  );
}

const styles = stylex.create({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  detail: {
    // The popup has no muted inverted ink; weight alone marks the detail.
    fontWeight: vars["--ads-font-weight-regular"],
  },
});
