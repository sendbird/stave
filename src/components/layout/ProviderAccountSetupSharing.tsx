import { useTranslation, i18n } from "@/i18n";
import { useEffect, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  describeProviderAccountSetup,
  type ProviderAccountSetupState,
} from "@/lib/providers/provider-account-setup";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { accountStyles as styles } from "./provider-accounts.styles";
import { sx } from "@/components/ads/utils/stylex";

export const USE_SYSTEM_SETUP_LABEL_KEY = "settingsConnections:accountSetup.useSystem" as const;

/**
 * Per-account switch for sharing System default's skills, instructions and
 * settings. Offered only for accounts Stave created; a folder the user
 * registered is theirs to arrange, and an API connection has no setup of its own.
 */
export function ProviderAccountSetupSharing(props: {
  profile: ProviderAccountProfile;
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const { profile } = props;
  const [setup, setSetup] = useState<ProviderAccountSetupState | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.api?.providerAccounts
      ?.setupStatus({ providerId: profile.providerId, id: profile.id })
      .then((result) => {
        if (!cancelled && result.ok) setSetup(result.setup);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile.providerId, profile.id]);
  if (!setup) return null;
  const apply = (enabled: boolean) =>
    props.run(async () => {
      const result = await window.api!.providerAccounts!.shareSetup({ providerId: profile.providerId, id: profile.id, enabled });
      if (!result.ok) throw new Error(result.message);
      setSetup(result.setup);
    });
  const copiesSettings = setup.entries.some((entry) => entry.action === "copy");
  return (
    <div className={sx(styles.stackTight)}>
      <Checkbox
        label={t(USE_SYSTEM_SETUP_LABEL_KEY)}
        description={describeProviderAccountSetup(profile.providerId, setup)}
        checked={setup.enabled}
        disabled={props.busy}
        onCheckedChange={(checked) => apply(checked === true)}
      />
      {setup.enabled && copiesSettings && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="sm" variant="quiet" flushInline disabled={props.busy} onClick={() => apply(true)}>
                {t("settingsConnections:providerAccountSetupSharing.updateCopiedSettings")}</Button>
            }
          />
          <TooltipContent>
            {t("settingsConnections:providerAccountSetupSharing.copiesYourSystemDefaultSettingsAgain")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
