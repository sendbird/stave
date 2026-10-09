import { i18n, useTranslation, type I18nKey } from "@/i18n";
import { useEffect } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { AgentsTab } from "@/components/agents/AgentsTab";
import { MyStandardsPanel } from "@/components/agents/MyStandardsPanel";
import { ResultsView } from "@/components/results/ResultsView";
import { useAppStore } from "@/store/app.store";
import { useAgentsViewStore, type AgentsViewTab } from "@/store/agents-view-store";
import { centerStyles } from "@/components/layout/automation-center/automation-center-view.styles";

const TABS: ReadonlyArray<readonly [AgentsViewTab, Extract<I18nKey, `${string}:${string}`>]> = [
  ["agents", "agents:agentsView.extraCopy30"],
  ["standards", "agents:agentsView.extraCopy31"],
  ["performance", "agents:agentsView.performanceTab"],
];

const TAB_NOTES: Record<AgentsViewTab, string> = {
  get agents() { return i18n.t("agents:agentsView.extraCopy32"); },
  get standards() { return i18n.t("agents:agentsView.extraCopy33"); },
  get performance() { return i18n.t("compare:agentPerformance.purpose"); },
};

/**
 * The Agents surface: saved agents (with their workflows), the standards added
 * to every agent, and how their ended runs went (Performance). One of Fleet
 * View, Automations, Issues, Agents and AI usage owns the main column at a
 * time; the tab is held in `useAgentsViewStore` so a deep link can open this
 * surface on a given tab.
 */
export function AgentsView(props: {
  /** Shows this tab instead of the stored one: server-rendered previews and tests. */
  tab?: AgentsViewTab;
} = {}) {
  useTranslation();
  const storedTab = useAgentsViewStore((state) => state.activeTab);
  const activeTab = props.tab ?? storedTab;
  const setActiveTab = useAgentsViewStore((state) => state.setActiveTab);
  const closeAgents = useAppStore((state) => state.closeAgents);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Escape" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      closeAgents();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAgents]);

  return (
    <div className={sx(centerStyles.root)}>
      <header className={sx(centerStyles.header)}>
        <div className={sx(centerStyles.headerText)}>
          <div className={sx(centerStyles.headerTitleRow)}>
            <Bot className={sx(centerStyles.headerIcon)} />
            <h1 className={sx(centerStyles.headerTitle)}>{i18n.t("agents:agentsView.agentsView")}</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>
            {i18n.t("agents:agentsView.agentsView2")}</p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            aria-label={i18n.t("agents:agentsView.close")}
            title={i18n.t("agents:agentsView.title")}
            onClick={closeAgents}
          >
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>

      <div className={sx(centerStyles.toolbar)}>
        <nav aria-label={i18n.t("agents:agentsView.ariaLabel")} className={sx(centerStyles.tabNav)}>
          {TABS.map(([id, label]) => (
            <ActionButton
              key={id}
              size="sm"
              weight={activeTab === id ? "secondary" : "quiet"}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
            >
              {i18n.t(label)}
            </ActionButton>
          ))}
        </nav>
        <p className={sx(centerStyles.toolbarNote)}>{TAB_NOTES[activeTab]}</p>
      </div>

      {activeTab === "agents" ? (
        <AgentsTab />
      ) : activeTab === "standards" ? (
        <MyStandardsPanel />
      ) : (
        <ResultsView embedded />
      )}
    </div>
  );
}
