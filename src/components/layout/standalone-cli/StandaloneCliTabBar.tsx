import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Button } from "@/components/ui";
import {
  getStandaloneCliTabTitle,
  STANDALONE_CLI_TAB_IDS,
} from "@/lib/terminal/standalone-cli";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function StandaloneCliTabBar() {
  const [activeTabId, setActiveTab] = useStandaloneCliStore(
    useShallow((state) => [state.activeTabId, state.setActiveTab] as const),
  );

  return (
    <div
      role="group"
      aria-label="Standalone CLI providers"
      className={sx(styles.tabBar)}
    >
      {STANDALONE_CLI_TAB_IDS.map((tabId) => (
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
