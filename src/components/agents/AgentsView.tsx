import { useEffect } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { AgentsTab } from "@/components/agents/AgentsTab";
import { MyStandardsPanel } from "@/components/agents/MyStandardsPanel";
import { useAppStore } from "@/store/app.store";
import { useAgentsViewStore, type AgentsViewTab } from "@/store/agents-view-store";
import { centerStyles } from "@/components/layout/automation-center/automation-center-view.styles";

const TABS: ReadonlyArray<readonly [AgentsViewTab, string]> = [
  ["agents", "Agents"],
  ["standards", "My standards"],
];

const TAB_NOTES: Record<AgentsViewTab, string> = {
  agents: "Saved agents to assign work to. An agent with a workflow works in stages.",
  standards: "Your own rules, added after every agent's instructions when on.",
};

/**
 * The Agents surface: saved agents (with their workflows) and the standards
 * added to every agent. One of Fleet View, Automations, Issues, Projects and
 * Agents owns the main column at a time; the tab is held in
 * `useAgentsViewStore` so a deep link can open this surface on a given tab.
 */
export function AgentsView() {
  const activeTab = useAgentsViewStore((state) => state.activeTab);
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
            <h1 className={sx(centerStyles.headerTitle)}>Agents</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>
            Assign work to a saved agent and set the standards every agent
            follows.
          </p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            aria-label="close-agents"
            title="Close Agents"
            onClick={closeAgents}
          >
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>

      <div className={sx(centerStyles.toolbar)}>
        <nav aria-label="Agents views" className={sx(centerStyles.tabNav)}>
          {TABS.map(([id, label]) => (
            <ActionButton
              key={id}
              size="sm"
              weight={activeTab === id ? "secondary" : "quiet"}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </ActionButton>
          ))}
        </nav>
        <p className={sx(centerStyles.toolbarNote)}>{TAB_NOTES[activeTab]}</p>
      </div>

      {activeTab === "agents" ? (
        <AgentsTab />
      ) : (
        <MyStandardsPanel />
      )}
    </div>
  );
}
