import { useTranslation, i18n } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app.store";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { selectedProviderAccount, shouldShowProviderAccountPicker } from "@/lib/providers/provider-account-selection";
import type { ProviderId } from "@/lib/providers/provider.types";
import { sx } from "@/components/ads/utils/stylex";
import { accountStyles as styles } from "./provider-accounts.styles";

/**
 * The account new turns use for this provider. Drawn only when there is a
 * choice to make (the same rule as the status bar switch), or when the active
 * account was removed and the picker is the way back.
 */
export function ProviderAccountPicker({ providerId }: { providerId: ProviderId }) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((s) => s.profiles);
  const value = useAppStore((s) => selectedProviderAccount(providerId, s.settings));
  const update = useAppStore((s) => s.updateSettings);
  if (!window.api?.providerAccounts) return null;
  if (providerId !== "claude-code" && providerId !== "codex") return null;
  const options = profiles.filter((p) => p.providerId === providerId);
  if (!shouldShowProviderAccountPicker({ options, selectedId: value })) return null;
  const name = providerId === "codex" ? "Codex" : "Claude";
  return <div className={sx(styles.picker)}>
    <span>{t("settingsConnections:providerAccountPicker.accountForNewTurns")}</span>
    <Select value={value} onValueChange={(id) => { if (id) update({ patch: providerId === "codex" ? { codexAccountProfileId: id } : { claudeAccountProfileId: id } }); }}>
      <SelectTrigger size="sm" className={sx(styles.pickerSelect)} aria-label={t("settingsConnections:providerAccountPicker.accountForNewTurnsVariantf1ac598c", { value1: name })}><SelectValue>{options.find(p => p.id === value)?.label ?? t("settingsConnections:providerAccountPicker.accountUnavailable")}</SelectValue></SelectTrigger>
      <SelectContent>{options.map(p => <SelectItem key={p.id} value={p.id}>{p.label}{p.gateway ? i18n.t("settingsConnections:providerAccountPicker.apiBilling") : ""}</SelectItem>)}</SelectContent>
    </Select>
    {options.find(p => p.id === value)?.gateway && <span>{t("settingsConnections:providerAccountPicker.billedPerTokenByTheGateway")}</span>}
  </div>;
}
