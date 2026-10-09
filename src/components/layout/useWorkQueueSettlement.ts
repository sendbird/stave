import { useEffect, useMemo } from "react";
import { i18n } from "@/i18n";
import { toast } from "@/components/ui";
import { useNow } from "@/components/agent-runs/useAgentRun";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  buildSidebarWorkQueueSections,
  type SidebarWorkQueueGroup,
  type SidebarWorkQueueSectionGroup,
} from "@/lib/fleet/sidebar-work-queue";
import {
  findAutoSettleReason,
  normalizeWorkspaceSettleAfterDays,
  resolveWorkspaceSettlement,
  type WorkspaceSettledReason,
  type WorkspaceSettlementSignals,
  type WorkspaceSettlementView,
} from "@/lib/fleet/workspace-settlement";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";
import type { SidebarWorkQueueEntry } from "./RepositoryWorkspaceSidebar.utils";

const CLOCK_INTERVAL_MS = 60_000;

function latestOpenTaskActivity(tasks: readonly Task[] | undefined): string | null {
  let latest: string | null = null;
  for (const task of tasks ?? []) {
    if (isTaskArchived(task)) continue;
    if (!latest || task.updatedAt.localeCompare(latest) > 0) latest = task.updatedAt;
  }
  return latest;
}

function latestResultAt(items: readonly FleetAttentionItem[] | undefined): string | null {
  let latest: string | null = null;
  for (const item of items ?? []) {
    if (item.kind !== "result-ready") continue;
    if (!latest || item.createdAt.localeCompare(latest) > 0) latest = item.createdAt;
  }
  return latest;
}

/**
 * Resolves where each Work queue workspace belongs (its lane, or the Snoozed
 * or Settled shelf), and applies the automatic settle rules. Settles from the
 * rules are written once, as a batch, with one undo for the batch; after that
 * they behave exactly like a settle the user made.
 */
export function useWorkQueueSettlement(args: {
  groups: readonly SidebarWorkQueueGroup<SidebarWorkQueueEntry>[];
  attentionItemsByWorkspaceId: Record<string, readonly FleetAttentionItem[] | undefined>;
}): {
  sections: SidebarWorkQueueSectionGroup<SidebarWorkQueueEntry>[];
  viewById: Record<string, WorkspaceSettlementView>;
} {
  const records = useAppStore((state) => state.workspaceSettlementById);
  const prInfoById = useAppStore((state) => state.workspacePrInfoById);
  const lastOpenedAtById = useAppStore((state) => state.workspaceLastActiveAtById);
  const runtimeCacheById = useAppStore((state) => state.workspaceRuntimeCacheById);
  const activeTasks = useAppStore((state) => state.tasks);
  const settleOnMerge = useAppStore((state) => state.settings.workQueueSettleOnMerge);
  const settleAfterDays = useAppStore((state) => state.settings.workQueueSettleAfterDays);
  const settleWorkspaces = useAppStore((state) => state.settleWorkspaces);
  const restoreWorkspaceSettlements = useAppStore((state) => state.restoreWorkspaceSettlements);
  // Snoozes end and inactivity accrues with time alone, so the queue re-reads
  // the clock while it is on screen.
  const nowMs = useNow(true, CLOCK_INTERVAL_MS);
  const { groups, attentionItemsByWorkspaceId } = args;

  const resolved = useMemo(() => {
    const rules = {
      settleOnMerge,
      settleAfterDays: normalizeWorkspaceSettleAfterDays(settleAfterDays),
    };
    const viewById: Record<string, WorkspaceSettlementView> = {};
    const candidates: Array<{ workspaceId: string; reason: WorkspaceSettledReason }> = [];
    for (const group of groups) {
      for (const entry of group.entries) {
        const tasks = entry.isActive
          ? activeTasks
          : runtimeCacheById[entry.workspaceId]?.tasks;
        const pr = prInfoById[entry.workspaceId]?.pr ?? null;
        const signals: WorkspaceSettlementSignals = {
          lane: group.lane,
          isActive: entry.isActive,
          isDefault: entry.isDefault,
          pullRequest: pr ? { state: pr.state, mergedAt: pr.mergedAt } : null,
          lastOpenedAt: lastOpenedAtById[entry.workspaceId] ?? null,
          lastTaskActivityAt: latestOpenTaskActivity(tasks),
          lastResultAt: latestResultAt(attentionItemsByWorkspaceId[entry.workspaceId]),
        };
        const record = records[entry.workspaceId];
        const view = resolveWorkspaceSettlement({ record, signals, nowMs });
        viewById[entry.workspaceId] = view;
        if (view.state === "active") {
          const reason = findAutoSettleReason({ record, signals, rules, nowMs });
          if (reason) candidates.push({ workspaceId: entry.workspaceId, reason });
        }
      }
    }
    const sections = buildSidebarWorkQueueSections({
      groups,
      shelfOf: (entry) => {
        const view = viewById[entry.workspaceId];
        if (view?.state === "settled") return { section: "settled", at: view.since };
        if (view?.state === "snoozed") return { section: "snoozed", at: view.until };
        return null;
      },
    });
    return { sections, viewById, candidates };
  }, [
    activeTasks,
    attentionItemsByWorkspaceId,
    groups,
    lastOpenedAtById,
    nowMs,
    prInfoById,
    records,
    runtimeCacheById,
    settleAfterDays,
    settleOnMerge,
  ]);

  const candidateKey = resolved.candidates
    .map((candidate) => `${candidate.workspaceId}:${candidate.reason}`)
    .join("|");
  useEffect(() => {
    if (resolved.candidates.length === 0) return;
    const previous = settleWorkspaces({ settlements: resolved.candidates });
    toast(i18n.t("workspace:workQueueSettlement.autoSettled", { count: resolved.candidates.length }), {
      description: i18n.t("workspace:workQueueSettlement.autoSettledDetail"),
      action: {
        label: i18n.t("workspace:workQueueSettlement.undo"),
        onClick: () => restoreWorkspaceSettlements({ records: previous }),
      },
    });
    // The key names the batch; the candidates array is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  return { sections: resolved.sections, viewById: resolved.viewById };
}
