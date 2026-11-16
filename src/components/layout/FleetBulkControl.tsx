import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { previewFleetChildren } from "@/lib/fleet/stop-preview";
import { stopFleetItem } from "@/lib/fleet/stop-control";
import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useTranslation, i18n } from "@/i18n";
import { Button } from "@/components/ui";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { ConfirmDialog } from "./ConfirmDialog";
import { FleetSelectionStatus } from "./FleetSelection";
import { useFleetSelectionStore, type FleetSelectionTarget } from "@/store/fleet-selection-store";
import { useFleetBulkActions } from "./useFleetBulkActions";
import { planFleetAttentionSnooze, planFleetOutcomeRead, planFleetOutcomeReview, countFleetBulkPlan } from "@/lib/fleet/attention-bulk";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useAppStore } from "@/store/app.store";
import { runFleetControl } from "@/lib/fleet/bulk-control";
import { archiveFleetTask, fleetArchiveVersion, inFleetWorkspace } from "@/lib/fleet/archive-client";
import { deleteFleetTask } from "@/lib/fleet/task-control-client";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import { toast } from "@/lib/notifications/toast";
import { isTaskManaged } from "@/lib/tasks";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { findActiveTaskRun, findTarsResponsibility, tarsTaskTarget } from "@/lib/tars/ownership";
import { useTarsSnapshotStore } from "@/store/tars-snapshot-store";
import { routeTarsOwnedIntent, tarsHoldsTask } from "@/store/tars-owned-control";

import { FLEET_BULK_COMMAND, takeFleetBulkCommand } from "@/lib/fleet/bulk-command";
type Operation = "stop" | "archive" | "delete";
const targetOf = (row: FleetTaskRow): FleetSelectionTarget => ({ ...row, taskId: row.task.id });
export function FleetBulkControl({ rows, onOpenTask }: { rows: readonly FleetTaskRow[]; onOpenTask: (target: FleetSelectionTarget) => void }) {
  const { t } = useTranslation(["fleet"]);
  const runDetails = useFleetAgentRunsStore((state) => state.details);
  const hasEndedRun = (target: {workspaceId: string; taskId: string}) => Object.values(runDetails).some(({agentRun: run}) => run.workspaceId === target.workspaceId && run.leadTaskId === target.taskId && !isActiveAgentRunState(run.state));
  const selectedKeys = useFleetSelectionStore((state) => state.selectedKeys);
  const visibleTargets = useFleetSelectionStore((state) => state.visibleTargets);
  const selected = visibleTargets.filter((target) => selectedKeys.has(target.key));
  const attention = useFleetAttention((state) => state.items);
  const items = attention.filter((item) => selected.some((target) => target.taskId === item.taskId && target.workspaceId === item.workspaceId));
  const bulk = useFleetBulkActions();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmation, setConfirmation] = useState<{ operation: Operation; targets: FleetSelectionTarget[]; description?: string } | null>(null);
  const [childParents, setChildParents] = useState<ReadonlySet<string>>(new Set());
  const parentIdsKey = JSON.stringify(rows.map((row) => row.task.id));
  useEffect(() => {
    let cancelled = false;
    void previewFleetChildren(JSON.parse(parentIdsKey), async (parentTaskId) => await window.api?.runs?.listDelegatedTasks?.({parentTaskId,includeFinished:false}) ?? []).then((preview) => {
      if (!cancelled) setChildParents((current) => current.size === preview.parentsWithChildren.size && [...current].every((id) => preview.parentsWithChildren.has(id)) ? current : preview.parentsWithChildren);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [parentIdsKey, runDetails]);
  const running = rows.filter((row) => row.activeTurnId || childParents.has(row.task.id) || findActiveTaskRun(runDetails, row.workspaceId, row.task.id));
  const execute = async (operation: Operation, targets: FleetSelectionTarget[]) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setConfirmation(null);
    try {
      const archiveVersions = new Map<string, string | undefined>();
      const result = await runFleetControl(targets, async (target) => {
        if (operation === "delete") { const result = await deleteFleetTask(target); return result.ok ? null : result.message ?? t("fleet:bulk.changed"); }
        if (operation === "archive") {
          const run = findActiveTaskRun(useFleetAgentRunsStore.getState().details,target.workspaceId,target.taskId);
          if (await tarsHoldsTask(tarsTaskTarget(target.taskId,target.workspaceId,run))) return t("fleet:bulk.managedByTars");
          const reason = await archiveFleetTask(target); if (!reason) archiveVersions.set(target.key, fleetArchiveVersion(target)); return reason ? t("fleet:bulk.changed") : null; }
        const runs = useFleetAgentRunsStore.getState();
        if (!runs.loaded && window.api?.taskControl) return t("fleet:bulk.loading");
        const run = findActiveTaskRun(runs.details, target.workspaceId, target.taskId);
        const outcome = await stopFleetItem({
          routeOwnership: async () => (await routeTarsOwnedIntent({ target: tarsTaskTarget(target.taskId, target.workspaceId, run), intent: "pause", source: "fleet" })).kind,
          stop: async (keepAgentRun) => {
            const state = useAppStore.getState();
            const session = target.workspaceId === state.activeWorkspaceId ? state : state.workspaceRuntimeCacheById[target.workspaceId];
            if (!session?.tasks.some((item) => item.id === target.taskId)) {
              return inFleetWorkspace(target, () => useAppStore.getState().abortTaskTurn({ taskId: target.taskId, keepAgentRun }));
            }
            if (!session.activeTurnIdsByTask[target.taskId] && !run) {
              const children = await window.api?.runs?.listDelegatedTasks?.({ parentTaskId:target.taskId,includeFinished:false });
              if (!children?.length) return false;
            }
            return state.abortTaskTurn({ taskId: target.taskId, keepAgentRun });
          },
        });
        return outcome === "stopped" ? null : outcome === "managed" ? t("fleet:bulk.managedByTars") : t("fleet:bulk.changed");
      }, operation === "archive" ? 1 : 4);
      const title = t(`fleet:bulk.${operation}Result`, { count: result.changed.length, skipped: result.skipped.length });
      const description = result.skipped.map(({ item, reason }) => `${item.task?.title ?? item.taskId}: ${reason}`).join("; ");
      if (operation === "archive" && result.changed.length) offerUndoToast(title, { description, undoLabel: t("fleet:bulk.undo"), onUndo: async () => {
        const undone = await runFleetControl(result.changed, (target) => archiveFleetTask(target, true, archiveVersions.get(target.key)), 1);
        if (undone.skipped.length) toast.error(t("fleet:bulk.undoSkipped", { count: undone.skipped.length }));
      } });
      else toast(title, { description });
    } finally { busyRef.current = false; setBusy(false); }
  };
  const stopAll = async (repositoryPath?: string) => {
    const candidates = rows.filter((row) => !repositoryPath || row.repositoryPath === repositoryPath);
    let preview;
    try {
      preview = await previewFleetChildren(candidates.map((row) => row.task.id), async (parentTaskId) => await window.api?.runs?.listDelegatedTasks?.({ parentTaskId, includeFinished: false }) ?? []);
    } catch {
      toast.error(t("fleet:bulk.previewFailed"));
      return;
    }
    const targets = candidates.filter((row) => running.some((item) => item.key === row.key) || preview.parentsWithChildren.has(row.task.id)).map(targetOf);
    const children = preview.children.length;
    const runs = useFleetAgentRunsStore.getState().details;
    setConfirmation({ operation: "stop", targets, description: t("fleet:bulk.stopSummary", { turns: targets.filter((item) => item.activeTurnId).length, children, runs: targets.filter((item) => findActiveTaskRun(runs, item.workspaceId, item.taskId)).length, tars: targets.filter((item) => findTarsResponsibility(useTarsSnapshotStore.getState().snapshot?.responsibilities, tarsTaskTarget(item.taskId, item.workspaceId, findActiveTaskRun(runs,item.workspaceId,item.taskId)))).length }) });
  };
  useEffect(() => {
    const handle = () => {
      const detail = takeFleetBulkCommand();
      if (!detail) return;
      if (detail.operation === "stop") void stopAll(detail.repositoryPath);
      else if (detail.operation === "read") void bulk.apply(planFleetOutcomeRead(attention));
      else if (detail.operation === "archive") {
        const workspaceId = useAppStore.getState().activeWorkspaceId;
        setConfirmation({ operation: "archive", targets: rows.filter((row) => row.workspaceId === workspaceId && !row.activeTurnId && !isTaskManaged(row.task) && hasEndedRun({workspaceId:row.workspaceId,taskId:row.task.id})).map(targetOf) });
      }
    };
    window.addEventListener(FLEET_BULK_COMMAND, handle);
    handle();
    return () => window.removeEventListener(FLEET_BULK_COMMAND, handle);
  });
  const applicable = (operation: Operation) => selected.filter((item) => operation === "stop" ? item.activeTurnId || childParents.has(item.taskId) || findActiveTaskRun(useFleetAgentRunsStore.getState().details, item.workspaceId, item.taskId) : !isTaskManaged(item.task ?? null) && (operation !== "delete" || (!item.activeTurnId && !findActiveTaskRun(runDetails,item.workspaceId,item.taskId) && (Boolean(item.task?.archivedAt) || hasEndedRun(item))))).length;
  return <>
    <div className={sx(styles.bar)} data-fleet-bulk-control="true">
      <Button size="sm" variant="outline" disabled={busy || !rows.length} onClick={() => void stopAll()}>{t("fleet:bulk.stopAll")}</Button>
      <FleetSelectionStatus />
      {selected.length ? <>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onOpenTask(selected[0]!)}>{t("fleet:bulk.open")}</Button>
        {(["stop", "archive", "delete"] as const).map((operation) => <Button key={operation} size="sm" variant="outline" disabled={busy || !applicable(operation)} onClick={() => operation === "stop" ? void execute(operation, selected) : setConfirmation({ operation, targets: selected })}>{t(`fleet:bulk.${operation}`, { count: applicable(operation) })}</Button>)}
        {([3_600_000,14_400_000,86_400_000,604_800_000] as const).map((duration, index) => <Button key={duration} size="sm" variant="ghost" disabled={bulk.applying || !items.length} onClick={() => void bulk.apply(planFleetAttentionSnooze(items, duration))}>{t((["fleet:bulk.snooze0", "fleet:bulk.snooze1", "fleet:bulk.snooze2", "fleet:bulk.snooze3"] as const)[index]!, { count: items.length })}</Button>)}
        <Button size="sm" variant="ghost" disabled={bulk.applying || !countFleetBulkPlan(planFleetOutcomeRead(items))} onClick={() => void bulk.apply(planFleetOutcomeRead(items))}>{t("fleet:bulk.read", { count: countFleetBulkPlan(planFleetOutcomeRead(items)) })}</Button>
        <Button size="sm" variant="ghost" disabled={bulk.applying || !countFleetBulkPlan(planFleetOutcomeReview(items))} onClick={() => void bulk.apply(planFleetOutcomeReview(items))}>{t("fleet:bulk.review", { count: countFleetBulkPlan(planFleetOutcomeReview(items)) })}</Button>
        <Button size="sm" variant="ghost" onClick={() => useFleetSelectionStore.getState().clear()}>{t("fleet:bulk.clear")}</Button>
      </> : null}
    </div>
    <ConfirmDialog open={Boolean(confirmation)} defaultFocus="cancel" loading={busy} title={confirmation ? t(`fleet:bulk.${confirmation.operation}Confirm`, { count: confirmation.targets.length }) : ""} description={confirmation?.operation === "delete" ? i18n.t("fleet:bulk.irreversible") : confirmation?.description} onCancel={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void execute(confirmation.operation, confirmation.targets); }} />
  </>;
}
const styles = stylex.create({ bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], padding: vars["--aui-space-8"] } });
