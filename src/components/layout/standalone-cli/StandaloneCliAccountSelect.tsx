import { useMemo } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLoadProviderAccounts,
  useProviderAccounts,
} from "@/lib/providers/use-provider-accounts";
import {
  getStandaloneCliTabTitle,
  listStandaloneCliAccountOptions,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";

/**
 * The account the active tab's CLI runs under. Picking another one restarts
 * that tab under the new account with a fresh conversation, because a running
 * CLI cannot change accounts and the old conversation belongs to the old one.
 */
export function StandaloneCliAccountSelect(props: {
  tabId: StandaloneCliTabId;
  value: string;
  onValueChange: (accountProfileId: string) => void;
}) {
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((state) => state.profiles);
  const options = useMemo(
    () => listStandaloneCliAccountOptions({ tabId: props.tabId, profiles }),
    [profiles, props.tabId],
  );

  const accountsBridge =
    typeof window === "undefined" ? undefined : window.api?.providerAccounts;
  if (!accountsBridge || options.length === 0) {
    return null;
  }

  const selected = options.find((profile) => profile.id === props.value);

  return (
    <Select
      value={props.value}
      onValueChange={(accountProfileId) => {
        if (accountProfileId && accountProfileId !== props.value) {
          props.onValueChange(accountProfileId);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        className={sx(styles.accountSelect)}
        aria-label={`${getStandaloneCliTabTitle(props.tabId)} account for this tab`}
        title="Switching accounts restarts this tab with a new conversation."
      >
        <SelectValue>{selected?.label ?? "Account unavailable"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.label}
            {profile.gateway ? " · API billing" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
