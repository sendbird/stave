import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { SidebarEmptyState } from "@/components/layout/SidebarEmptyState";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  SIDEBAR_WORK_QUEUE_SECTIONS_COLLAPSED_BY_DEFAULT,
  type SidebarWorkQueueGroup,
  type SidebarWorkQueueSection,
} from "@/lib/fleet/sidebar-work-queue";
import type { WorkspaceSettlementView } from "@/lib/fleet/workspace-settlement";
import type { SidebarWorkQueueEntry } from "./RepositoryWorkspaceSidebar.utils";
import { useWorkQueueSettlement } from "./useWorkQueueSettlement";
import { WorkQueueRow } from "./workspace-sidebar-rows";
import { WorkQueueRowActions } from "./WorkQueueRowActions";

const SETTLED_REASON_KEYS = {
  manual: "workspace:workQueueSettlement.reasonManual",
  merged: "workspace:workQueueSettlement.reasonMerged",
  inactive: "workspace:workQueueSettlement.reasonInactive",
} as const;

/** What a shelved row says instead of its repository name. */
function describeShelf(view: WorkspaceSettlementView | undefined): string | undefined {
  if (!view || view.state === "active") return undefined;
  if (view.state === "snoozed") {
    return i18n.t("workspace:workQueueSettlement.until", {
      time: formatDateTime(view.until, { weekday: "short", hour: "numeric", minute: "2-digit" }),
    });
  }
  return i18n.t(SETTLED_REASON_KEYS[view.reason]);
}

/**
 * The sidebar Work queue: lanes in priority order, then the Snoozed and
 * Settled shelves. Each section folds; running work and the shelves start
 * folded so the first thing in view is what needs the user.
 */
export function WorkQueueLaneList(props: {
  groups: readonly SidebarWorkQueueGroup<SidebarWorkQueueEntry>[];
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
  attentionItemsByWorkspaceId: Record<string, readonly FleetAttentionItem[] | undefined>;
  onOpen: (target: { repositoryPath: string; workspaceId: string }) => void;
}) {
  useTranslation();
  const { sections, viewById } = useWorkQueueSettlement({
    groups: props.groups,
    attentionItemsByWorkspaceId: props.attentionItemsByWorkspaceId,
  });
  const [collapsedBySection, setCollapsedBySection] = useState<
    Partial<Record<SidebarWorkQueueSection, boolean>>
  >({});

  return (
    <div className={sx(repositorySidebarStyles.navStack)}>
      {sections.length === 0 ? (
        <SidebarEmptyState kind="no-workspaces" />
      ) : (
        sections.map((group) => {
          const collapsed =
            collapsedBySection[group.section] ??
            SIDEBAR_WORK_QUEUE_SECTIONS_COLLAPSED_BY_DEFAULT.has(group.section);
          return (
            <div key={group.section} className={sx(repositorySidebarStyles.laneStack)}>
              <AdsButton
                layout="host"
                type="button"
                onClick={() =>
                  setCollapsedBySection((previous) => ({
                    ...previous,
                    [group.section]: !collapsed,
                  }))
                }
                data-testid={`work-queue-lane-${group.section}`}
                aria-label={i18n.t("workspace:repositoryWorkspaceSidebar.accessibility.workQueueLane", { value1: group.label })}
                aria-expanded={!collapsed}
                xstyle={[repositorySidebarStyles.laneButton, transition.colors]}
              >
                <ChevronRight
                  className={sx(
                    repositorySidebarStyles.laneChevron,
                    !collapsed && repositorySidebarStyles.laneChevronOpen,
                    transition.transform,
                  )}
                />
                <span className={sx(repositorySidebarStyles.laneLabel)}>{group.label}</span>
                <span className={sx(repositorySidebarStyles.laneCount)}>{group.entries.length}</span>
              </AdsButton>
              {collapsed
                ? null
                : group.entries.map((entry) => {
                    const view = viewById[entry.workspaceId] ?? { state: "active" as const };
                    return (
                      <WorkQueueRow
                        key={entry.workspaceId}
                        entry={entry}
                        attentionKind={props.highestAttentionByWorkspaceId[entry.workspaceId]?.kind}
                        onOpen={props.onOpen}
                        secondaryLabel={describeShelf(view)}
                        actions={
                          <WorkQueueRowActions
                            workspaceId={entry.workspaceId}
                            workspaceName={entry.workspaceName}
                            view={view}
                          />
                        }
                      />
                    );
                  })}
            </div>
          );
        })
      )}
    </div>
  );
}
