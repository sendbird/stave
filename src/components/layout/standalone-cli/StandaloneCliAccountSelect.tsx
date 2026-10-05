import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import {
  useLoadProviderAccounts,
  useProviderAccounts,
} from "@/lib/providers/use-provider-accounts";
import { shouldShowProviderAccountPicker } from "@/lib/providers/provider-account-selection";
import {
  getStandaloneCliTabTitle,
  listStandaloneCliAccountOptions,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";

/**
 * The account the active tab's CLI runs under. Picking another one restarts
 * that tab under the new account with a fresh conversation, because a running
 * CLI cannot change accounts and the old conversation belongs to the old one.
 * Drawn only when there is another account to pick, or when the tab is pinned
 * to an account that was removed and needs a way back.
 */
export function StandaloneCliAccountSelect(props: {
  tabId: StandaloneCliTabId;
  value: string;
  onValueChange: (accountProfileId: string) => void;
}) {
  const { t } = useTranslation("terminal");
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  useEffect(() => setPendingAccountId(null), [props.tabId, props.value]);
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((state) => state.profiles);
  const options = useMemo(
    () => listStandaloneCliAccountOptions({ tabId: props.tabId, profiles }),
    [profiles, props.tabId],
  );

  const accountsBridge =
    typeof window === "undefined" ? undefined : window.api?.providerAccounts;
  if (
    !accountsBridge ||
    !shouldShowProviderAccountPicker({ options, selectedId: props.value })
  ) {
    return null;
  }

  const selected = options.find((profile) => profile.id === props.value);
  const pendingAccount = options.find((profile) => profile.id === pendingAccountId);

  return (
    <>
      <Select
        value={props.value}
        onValueChange={(accountProfileId) => {
          if (accountProfileId && accountProfileId !== props.value) {
            setPendingAccountId(accountProfileId);
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className={sx(styles.accountSelect)}
          aria-label={t("standaloneCli.accountSelect.ariaLabel", {
            provider: getStandaloneCliTabTitle(props.tabId),
          })}
          title={t("standaloneCli.accountSelect.tooltip")}
        >
          <SelectValue>
            {selected?.label ?? t("standaloneCli.accountSelect.unavailable")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.gateway
                ? t("standaloneCli.accountSelect.apiBillingOption", {
                    label: profile.label,
                  })
                : profile.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ConfirmDialog
        open={pendingAccountId !== null}
        title={t("standaloneCli.accountSelect.confirm.title")}
        description={
          pendingAccount
            ? t("standaloneCli.accountSelect.confirm.description", {
                account: pendingAccount.label,
              })
            : t("standaloneCli.accountSelect.confirm.descriptionUnknownAccount")
        }
        confirmLabel={t("standaloneCli.accountSelect.confirm.confirm")}
        onCancel={() => setPendingAccountId(null)}
        onConfirm={() => {
          const accountProfileId = pendingAccountId;
          setPendingAccountId(null);
          if (accountProfileId && pendingAccount) {
            props.onValueChange(accountProfileId);
          }
        }}
      />
    </>
  );
}
