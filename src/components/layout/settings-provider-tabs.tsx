import { TabsList, TabsTrigger } from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { sx } from "@/components/ads/utils/stylex";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { settingsProviderTabsStyles as styles } from "./settings-provider-tabs.styles";

/**
 * Provider tab strip shared by every per-provider Settings surface. Render it
 * inside a `Tabs` root whose values are `ProviderId`s; each tab shows the
 * provider mark and its short label with the same spacing everywhere.
 */
export function SettingsProviderTabsList(args: {
  providerIds: readonly ProviderId[];
  "aria-label"?: string;
}) {
  return (
    <TabsList aria-label={args["aria-label"]} xstyle={styles.list}>
      {args.providerIds.map((providerId) => (
        <TabsTrigger key={providerId} value={providerId} xstyle={styles.trigger}>
          <ModelIcon providerId={providerId} className={sx(styles.icon)} />
          {getProviderLabel({ providerId })}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
