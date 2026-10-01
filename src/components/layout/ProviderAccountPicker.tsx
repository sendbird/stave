import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app.store";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import type { ProviderId } from "@/lib/providers/provider.types";
import { sx } from "@/components/ads/utils/stylex";
import { accountStyles as styles } from "./provider-accounts.styles";

export function ProviderAccountPicker({ providerId }: { providerId: ProviderId }) {
  useLoadProviderAccounts();
  const profiles = useProviderAccounts((s) => s.profiles);
  const value = useAppStore((s) => selectedProviderAccount(providerId, s.settings));
  const update = useAppStore((s) => s.updateSettings);
  if (!window.api?.providerAccounts) return null;
  if (providerId !== "claude-code" && providerId !== "codex") return null;
  const options = profiles.filter((p) => p.providerId === providerId);
  return <div className={sx(styles.picker)}>
    <span>Account for new turns</span>
    <Select value={value} onValueChange={(id) => { if (id) update({ patch: providerId === "codex" ? { codexAccountProfileId: id } : { claudeAccountProfileId: id } }); }}>
      <SelectTrigger size="sm" className={sx(styles.pickerSelect)} aria-label={`${providerId === "codex" ? "Codex" : "Claude"} account for new turns`}><SelectValue>{options.find(p => p.id === value)?.label ?? "Account unavailable"}</SelectValue></SelectTrigger>
      <SelectContent>{options.map(p => <SelectItem key={p.id} value={p.id}>{p.label}{p.gateway ? " · API billing" : ""}</SelectItem>)}</SelectContent>
    </Select>
    {options.find(p => p.id === value)?.gateway && <span>Gateway · API billing</span>}
  </div>;
}
