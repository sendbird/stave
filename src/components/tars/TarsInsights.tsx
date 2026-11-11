import { Tooltip } from "@/components/aui/components/Tooltip";
import { useCallback, useMemo, useState } from "react";
import { BookOpenText } from "lucide-react";
import { useTranslation } from "@/i18n";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { Button } from "@/components/ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { listAgents } from "@/lib/agents/library";
import { getAgentDisplayName } from "@/lib/agents/display";
import type { RepositoryMemorySourceTask } from "@/lib/repository-memory";
import type { TarsConversationSettings } from "@/lib/tars/conversation";
import type { TarsBridgeApi, TarsIdentity } from "@/lib/tars/types";
import { tarsInsightsStyles as styles } from "./tars-insights.styles";
import { TarsKnowsView } from "./TarsKnowsView";
import { useTarsTextScale } from "./TarsMessageChrome";
import { TarsUsageView } from "./TarsUsageView";
import { useTarsUsage } from "./use-tars-insights";

type InsightsView = "knows" | "usage";

/**
 * The header's one entry to the two read-mostly views: what Tars knows and
 * what its work spent. Each opens as a sheet beside the conversation; both
 * are view-only and never recorded in it.
 */
export function TarsInsights({ identity, settings, bridge, onEditSettings, onOpenWork }: {
  /** Null until the snapshot was read; the entry is disabled until then. */
  identity: TarsIdentity | null;
  settings: TarsConversationSettings | null;
  bridge: Pick<TarsBridgeApi, "getUsage"> | undefined;
  /** Opens Tars settings, the editor of the standing instructions and the allowed agents. */
  onEditSettings: () => void;
  /** Opens one work from its usage row. */
  onOpenWork: (responsibilityId: string) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const [view, setView] = useState<InsightsView | null>(null);
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const repositories = useAppStore((state) => state.recentRepositories);
  const agentNames = useMemo(() => new Map(listAgents({ custom: customAgents, activeOnly: false }).map((agent) => [agent.id, getAgentDisplayName(agent)])), [customAgents]);
  const agentNameOf = useCallback((id: string) => agentNames.get(id) ?? null, [agentNames]);
  const usage = useTarsUsage(bridge, view === "usage");
  // The sheets sit outside the conversation column, so they publish its type scale themselves.
  const textScale = useTarsTextScale();
  const close = () => setView(null);
  /** The memory's task, in its own workspace: the way a work's own task opens from the tray. */
  const openTask = (task: RepositoryMemorySourceTask, repositoryPath: string) => {
    close();
    const store = useAppStore.getState();
    void store.focusTaskAttention({ taskId: task.taskId, workspaceId: task.workspaceId, repositoryPath, refreshFromPersistence: true })
      .then(() => { if (useAppStore.getState().tasks.some((entry) => entry.id === task.taskId)) store.exitToWorkspace("tars"); })
      .catch(() => undefined);
  };
  return <>
    <DropdownMenu placement="bottom-end" trigger={<BookOpenText aria-hidden />}
      triggerProps={{ render: (props) => <Tooltip content={t("shell:tars.knows.menu")}><Button {...props} variant="ghost" size="icon-sm" disabled={!identity} focusableWhenDisabled aria-label={t("shell:tars.knows.menu")} data-tars-insights="" /></Tooltip> }}
      groups={[{ items: [
        { label: t("shell:tars.knows.open"), onSelect: () => setView("knows") },
        { label: t("shell:tars.usage.open"), onSelect: () => setView("usage") },
      ] }]} />
    <Sheet open={view === "knows"} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent xstyle={styles.sheet} style={textScale} data-tars-insights-sheet="knows">
        <SheetHeader><SheetTitle>{t("shell:tars.knows.title")}</SheetTitle><SheetDescription>{t("shell:tars.knows.description")}</SheetDescription></SheetHeader>
        {identity && view === "knows" ? <TarsKnowsView identity={identity} settings={settings} agentNameOf={agentNameOf} repositories={repositories}
          onEditSettings={() => { close(); onEditSettings(); }} onOpenTask={openTask}
          onEditRepository={(repositoryPath) => { close(); window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "projects", repositoryPath } })); }} /> : null}
      </SheetContent>
    </Sheet>
    <Sheet open={view === "usage"} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent xstyle={styles.sheet} style={textScale} data-tars-insights-sheet="usage">
        <SheetHeader><SheetTitle>{t("shell:tars.usage.title")}</SheetTitle><SheetDescription>{t("shell:tars.usage.description")}</SheetDescription></SheetHeader>
        {view === "usage" ? <TarsUsageView state={usage.state} onReload={() => void usage.reload()} onOpenWork={(responsibilityId) => { close(); onOpenWork(responsibilityId); }} /> : null}
      </SheetContent>
    </Sheet>
  </>;
}
