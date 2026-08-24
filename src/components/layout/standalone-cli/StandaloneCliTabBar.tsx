import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Button } from "@/components/ui";
import {
  getStandaloneCliTabTitle,
  STANDALONE_CLI_TAB_IDS,
} from "@/lib/terminal/standalone-cli";
import { cn } from "@/lib/utils";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function StandaloneCliTabBar() {
  const [activeTabId, setActiveTab] = useStandaloneCliStore(
    useShallow((state) => [state.activeTabId, state.setActiveTab] as const),
  );

  return (
    <div
      role="tablist"
      aria-label="Standalone CLI providers"
      className="flex items-center gap-1"
    >
      {STANDALONE_CLI_TAB_IDS.map((tabId) => (
        <Button
          key={tabId}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={tabId === activeTabId}
          className={cn(
            "h-7 gap-2 px-2 text-xs",
            tabId === activeTabId
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab({ tabId })}
        >
          <ModelIcon providerId={tabId} className="size-3.5" />
          {getStandaloneCliTabTitle(tabId)}
        </Button>
      ))}
    </div>
  );
}
