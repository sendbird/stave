import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";
import {
  getStandaloneCliTabTitle,
  resolveStandaloneCliActiveTabId,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function StandaloneCliTabBar(props: {
  tabIds: readonly StandaloneCliTabId[];
}) {
  const { t } = useTranslation("terminal");
  const [storedActiveTabId, setActiveTab] = useStandaloneCliStore(
    useShallow((state) => [state.activeTabId, state.setActiveTab] as const),
  );
  const activeTabId = resolveStandaloneCliActiveTabId({
    activeTabId: storedActiveTabId,
    installedTabIds: props.tabIds,
  });

  return (
    <div
      role="group"
      aria-label={t("standaloneCli.providersLabel")}
      className={sx(styles.tabBar)}
    >
      {props.tabIds.map((tabId) => (
        <Button
          key={tabId}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={tabId === activeTabId}
          xstyle={[styles.tab, tabId === activeTabId && styles.tabActive]}
          onClick={() => setActiveTab({ tabId })}
        >
          <ModelIcon providerId={tabId} className={sx(styles.tabIcon)} />
          {getStandaloneCliTabTitle(tabId)}
        </Button>
      ))}
    </div>
  );
}
