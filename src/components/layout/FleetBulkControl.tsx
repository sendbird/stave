import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { DropdownMenu, type DropdownMenuItem } from "@/components/aui/components/DropdownMenu";
import { Toolbar, ToolbarButtonGroup, ToolbarDivider } from "@/components/aui/components/Toolbar";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { ConfirmDialog } from "./ConfirmDialog";
import { FleetSelectionStatus } from "./FleetSelection";
import { useFleetSelectionStore, type FleetSelectionTarget } from "@/store/fleet-selection-store";
import { useFleetBulkActions } from "./useFleetBulkActions";
import { planFleetAttentionSnooze, planFleetOutcomeRead, planFleetOutcomeReview, countFleetBulkPlan } from "@/lib/fleet/attention-bulk";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useAppStore } from "@/store/app.store";
import { runFleetControl } from "@/lib/fleet/bulk-control";
import { planFleetControl, type FleetControlOperation, type FleetControlFacts } from "@/lib/fleet/control-plan";
import { archiveFleetTask, fleetArchiveVersion, ensureFleetWorkspace } from "@/lib/fleet/archive-client";
import { deleteFleetTask } from "@/lib/fleet/task-control-client";
import { stopFleetItem } from "@/lib/fleet/stop-control";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import { toast } from "@/lib/notifications/toast";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import { isFleetAnswerNeed } from "@/lib/fleet/task-rows";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { findActiveTaskRun, tarsTaskTarget } from "@/lib/tars/ownership";
import { routeTarsOwnedIntent, tarsHoldsTask } from "@/store/tars-owned-control";
import { FLEET_BULK_COMMAND, requestFleetBulkCommand, takeFleetBulkCommand } from "@/lib/fleet/bulk-command";

type Skipped = { item: FleetSelectionTarget; reason: string };
type Confirmation = { operation: FleetControlOperation; targets: FleetSelectionTarget[]; skipped: Skipped[]; description?: string } | { operation: "read"; description: string };
const targetOf = (row: FleetTaskRow): FleetSelectionTarget => ({ ...row, taskId: row.task.id });
function controlFacts(rows: readonly FleetTaskRow[]): FleetControlFacts {
  const runs = useFleetAgentRunsStore.getState().details;
  const running = new Set<string>();
  const waiting = new Set<string>();
  const liveTaskIds = new Set(rows.filter(row => row.activeTurnId || findActiveTaskRun(runs, row.workspaceId, row.task.id)).map(row => row.task.id));
  const parents = new Map(rows.map(row => [row.task.id, row.task.parentTaskId]));
  for (const id of [...liveTaskIds]) {
    let parent = parents.get(id);
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) { seen.add(parent); liveTaskIds.add(parent); parent = parents.get(parent); }
  }
  for (const row of rows) {
    if (liveTaskIds.has(row.task.id)) running.add(row.key);
    if (isFleetAnswerNeed(row.need) || row.status === "waiting-approval" || row.status === "waiting-input") waiting.add(row.key);
  }
  return { running, waiting };
}
export function FleetStopAllButton({ rows, loading = false }: { rows: readonly FleetTaskRow[]; loading?: boolean }) {
  const { t } = useTranslation(["fleet"]);
  const runs = useFleetAgentRunsStore(state => state.details);
  const hasRunning = rows.some(row => row.activeTurnId || findActiveTaskRun(runs, row.workspaceId, row.task.id));
  return hasRunning ? <Button variant="outlined" size="sm" disabled={loading} onClick={() => requestFleetBulkCommand({operation:"stop"})}>{t("fleet:bulk.stopAll")}</Button> : null;
}
export function FleetBulkControl({ rows, loading = false, onOpenTask }: { loading?: boolean; rows: readonly FleetTaskRow[]; onOpenTask: (target: FleetSelectionTarget) => void }) {
  const { t } = useTranslation(["fleet"]);
  const runsLoaded = useFleetAgentRunsStore(state => state.loaded);
  const runDetails = useFleetAgentRunsStore(state => state.details);
  const waiting = loading || Boolean(window.api?.agentRuns && !runsLoaded);
  const selectedKeys = useFleetSelectionStore(state => state.selectedKeys);
  const visibleTargets = useFleetSelectionStore(state => state.visibleTargets);
  const selected = visibleTargets.filter(target => selectedKeys.has(target.key));
  const attention = useFleetAttention(state => state.items);
  const selectedIds = new Set(selected.map(item => JSON.stringify([item.workspaceId,item.taskId])));
  const items = attention.filter(item => selectedIds.has(JSON.stringify([item.workspaceId,item.taskId])));
  const bulk = useFleetBulkActions();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const previewSequence = useRef(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [narrow, setNarrow] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setNarrow(entry.contentRect.width < 640); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected.length > 0]);
  const selectedSignature = JSON.stringify(selected.map(item => item.key));
  useEffect(() => { previewSequence.current++; }, [selectedSignature]);
  useEffect(() => () => { previewSequence.current++; }, []);
  useEffect(() => { previewSequence.current++; }, [selectedKeys]);
  const reasonText = (reason: string) => {
    switch (reason) {
      case "no-running-work": return t("fleet:bulk.noRunningWork");
      case "live-work": case "running": case "active-turn": case "active-child": case "active-run": return t("fleet:bulk.liveWork");
      case "pending-interaction": case "waiting": return t("fleet:bulk.waiting");
      case "not-archived": return t("fleet:bulk.archiveFirst");
      case "protected": case "managed-task": case "managed": case "owner-managed": return t("fleet:bulk.protected");
      case "owned": case "tars-owned": return t("fleet:bulk.managedByTars");
      case "partial-stop": case "failed": return t("fleet:bulk.actionFailed");
      case "loading": return t("fleet:bulk.loading");
      case "unavailable": return t("fleet:bulk.unavailable");
      default: return t("fleet:bulk.changed");
    }
  };
  const describeSkipped = (skipped: Skipped[]) => skipped.map(({item,reason}) => `${item.task?.title ?? item.taskId}: ${reasonText(reason)}`).join("; ");
  const facts = controlFacts(rows);
  for (const item of attention) if (item.kind === "approval" || item.kind === "user-input") {
    for (const target of selected) if (target.taskId === item.taskId && target.workspaceId === item.workspaceId) (facts.waiting as Set<string>).add(target.key);
  }
  const plans = { stop: planFleetControl("stop", selected, facts), archive: planFleetControl("archive", selected, facts), delete: planFleetControl("delete", selected, facts) };
  const execute = async (operation: FleetControlOperation, targets: FleetSelectionTarget[], excluded: Skipped[]) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setConfirmation(null);
    try {
      const versions = new Map<string, string | undefined>();
      const result = await runFleetControl(targets, async target => {
        if (operation === "delete") { const outcome = await deleteFleetTask(target); return outcome.ok ? null : outcome.reason ?? "changed"; }
        if (operation === "archive") {
          const freshPlan = planFleetControl(operation, [target], controlFacts(rows));
          if (freshPlan.skipped.length) return freshPlan.skipped[0]!.reason;
          const run = findActiveTaskRun(useFleetAgentRunsStore.getState().details,target.workspaceId,target.taskId);
          if (await tarsHoldsTask(tarsTaskTarget(target.taskId,target.workspaceId,run))) return "owned";
          const reason = await archiveFleetTask(target);
          if (!reason) versions.set(target.key, fleetArchiveVersion(target));
          return reason;
        }
        const runs = useFleetAgentRunsStore.getState();
        if (!runs.loaded && window.api?.taskControl) return "loading";
        const run = findActiveTaskRun(runs.details,target.workspaceId,target.taskId);
        const outcome = await stopFleetItem({
          routeOwnership: async () => (await routeTarsOwnedIntent({target:tarsTaskTarget(target.taskId,target.workspaceId,run),intent:"pause",source:"fleet"})).kind,
          stop: async keepAgentRun => {
            await ensureFleetWorkspace(target);
            return useAppStore.getState().abortTaskTurn({taskId:target.taskId,keepAgentRun,cascade:!keepAgentRun});
          },
        });
        return outcome === "stopped" ? null : outcome === "managed" ? "owned" : "changed";
      }, operation === "archive" ? 1 : 4);
      const skipped = [...excluded,...result.skipped];
      const title = t(`fleet:bulk.${operation}Result`,{count:result.changed.length,skipped:skipped.length});
      const description = describeSkipped(skipped);
      if (operation === "archive" && result.changed.length) offerUndoToast(title,{description,undoLabel:t("fleet:bulk.undo"),onUndo:async () => {
        const undone = await runFleetControl(result.changed,target => archiveFleetTask(target,true,versions.get(target.key)),1);
        if (undone.skipped.length) toast.error(t("fleet:bulk.undoSkipped",{count:undone.skipped.length}));
      }});
      else toast(title,{description});
    } finally { busyRef.current = false; setBusy(false); }
  };
  const openStop = async (candidates: FleetSelectionTarget[]) => {
    const sequence = ++previewSequence.current;
    let plan = planFleetControl("stop",candidates,controlFacts(rows));
    let turns = plan.applicable.filter(item => item.activeTurnId).length;
    let children = 0;
    let runs = plan.applicable.filter(item => findActiveTaskRun(useFleetAgentRunsStore.getState().details,item.workspaceId,item.taskId)).length;
    let owned = 0;
    try {
      if (window.api?.taskControl?.previewStop) {
        const preview = await window.api.taskControl.previewStop({targets:candidates.map(({workspaceId,taskId}) => ({workspaceId,taskId}))});
        if (sequence !== previewSequence.current) return;
        if (!preview.ok) { toast.error(t("fleet:bulk.previewFailed")); return; }
        const live = new Set(preview.items.filter(item => item.turns || item.children || item.runs).map(item => JSON.stringify([item.workspaceId,item.taskId])));
        const running = new Set(candidates.filter(item => live.has(JSON.stringify([item.workspaceId,item.taskId]))).map(item => item.key));
        plan = planFleetControl("stop",candidates,{running,waiting:new Set()});
        ({turns,children,runs} = preview);
        owned = preview.items.filter(item => live.has(JSON.stringify([item.workspaceId,item.taskId]))).reduce((sum,item) => sum + item.owned,0);
      }
      if (sequence !== previewSequence.current) return;
      setConfirmation({operation:"stop",targets:plan.applicable,skipped:plan.skipped,description:t("fleet:bulk.stopSummary",{turns,children,runs,tars:owned})});
    } catch { if (sequence === previewSequence.current) toast.error(t("fleet:bulk.previewFailed")); }
  };
  const openAction = (operation: "archive" | "delete") => {
    const plan = plans[operation];
    setConfirmation({operation,targets:plan.applicable,skipped:plan.skipped,description:describeSkipped(plan.skipped)});
  };
  useEffect(() => {
    const handle = () => {
      if (waiting) return;
      const command = takeFleetBulkCommand();
      if (!command) return;
      if (command.operation === "stop") void openStop(rows.filter(row => !command.repositoryPath || row.repositoryPath === command.repositoryPath).map(targetOf));
      else if (command.operation === "read") setConfirmation({operation:"read",description:t("fleet:bulk.readsCannotBeUndone")});
      else {
        const workspaceId = useAppStore.getState().activeWorkspaceId;
        const ended = rows.filter(row => row.workspaceId === workspaceId && Object.values(runDetails).some(({agentRun:run}) => run.workspaceId === workspaceId && run.leadTaskId === row.task.id && !isActiveAgentRunState(run.state))).map(targetOf);
        const plan = planFleetControl("archive",ended,controlFacts(rows));
        setConfirmation({operation:"archive",targets:plan.applicable,skipped:plan.skipped,description:describeSkipped(plan.skipped)});
      }
    };
    window.addEventListener(FLEET_BULK_COMMAND,handle); handle();
    return () => window.removeEventListener(FLEET_BULK_COMMAND,handle);
  });
  const readPlan = planFleetOutcomeRead(items), reviewPlan = planFleetOutcomeReview(items);
  const snoozePlan = planFleetAttentionSnooze(items,3_600_000);
  const snoozeItems: DropdownMenuItem[] = ([3_600_000,14_400_000,86_400_000,604_800_000] as const).map((duration,index) => ({label:t((["fleet:bulk.snooze0","fleet:bulk.snooze1","fleet:bulk.snooze2","fleet:bulk.snooze3"] as const)[index]!,{count:countFleetBulkPlan(snoozePlan)}),disabled:bulk.applying,onSelect:() => { void bulk.apply(planFleetAttentionSnooze(items,duration)); }}));
  const more: DropdownMenuItem[] = [];
  if (narrow) {
    if (plans.stop.applicable.length) more.push({label:t("fleet:bulk.stop",{count:plans.stop.applicable.length}),onSelect:() => { void openStop(selected); }});
    if (plans.archive.applicable.length) more.push({label:t("fleet:bulk.archive",{count:plans.archive.applicable.length}),onSelect:() => openAction("archive")});
    if (countFleetBulkPlan(snoozePlan)) more.push(...snoozeItems);
  }
  if (countFleetBulkPlan(readPlan)) more.push({label:t("fleet:bulk.read",{count:countFleetBulkPlan(readPlan)}),onSelect:() => { void bulk.apply(readPlan); }});
  if (countFleetBulkPlan(reviewPlan)) more.push({label:t("fleet:bulk.review",{count:countFleetBulkPlan(reviewPlan)}),onSelect:() => { void bulk.apply(reviewPlan); }});
  if (selected.length === 1) more.push({label:t("fleet:bulk.openCount",{count:1}),onSelect:() => onOpenTask(selected[0]!)});
  if (plans.delete.applicable.length) more.push({label:t("fleet:bulk.delete",{count:plans.delete.applicable.length}),tone:"danger",onSelect:() => openAction("delete")});
  return <>
    {selected.length > 0 ? <Toolbar ref={toolbarRef} data-fleet-bulk-control="true" aria-label={t("fleet:bulk.selectionActions")} xstyle={styles.bar}>
      <FleetSelectionStatus />
      <Tooltip content={t("fleet:bulk.clear")} shortcut="Esc"><Button size="2xs" variant="quiet" iconOnly aria-label={t("fleet:bulk.clear")} onClick={() => useFleetSelectionStore.getState().clear()}><X /></Button></Tooltip>
      <ToolbarDivider />
      {!narrow ? <ToolbarButtonGroup>
        {plans.stop.applicable.length ? <Button size="xs" variant="outlined" disabled={busy || waiting} onClick={() => void openStop(selected)}>{t("fleet:bulk.stop",{count:plans.stop.applicable.length})}</Button> : null}
        {plans.archive.applicable.length ? <Button size="xs" variant="outlined" disabled={busy || waiting} onClick={() => openAction("archive")}>{t("fleet:bulk.archive",{count:plans.archive.applicable.length})}</Button> : null}
        {countFleetBulkPlan(snoozePlan) ? <DropdownMenu trigger={<Button size="xs" variant="quiet" disabled={bulk.applying}>{t("fleet:bulk.snoozeMenu",{count:countFleetBulkPlan(snoozePlan)})}</Button>} groups={[{items:snoozeItems}]} /> : null}
      </ToolbarButtonGroup> : null}
      {more.length ? <DropdownMenu trigger={<Button size="xs" variant="quiet" disabled={busy || waiting}>{t("fleet:bulk.more")}</Button>} groups={[{items:more}]} /> : null}
    </Toolbar> : null}
    <ConfirmDialog open={Boolean(confirmation)} defaultFocus="cancel" loading={busy} title={confirmation ? confirmation.operation === "read" ? t("fleet:bulk.readConfirm") : t(`fleet:bulk.${confirmation.operation}Confirm`,{count:confirmation.targets.length}) : ""} description={confirmation?.operation === "delete" ? [t("fleet:bulk.irreversible"),confirmation.description].filter(Boolean).join(" ") : confirmation?.description} onCancel={() => {previewSequence.current++;setConfirmation(null);}} onConfirm={() => {
      if (!confirmation) return;
      if (confirmation.operation === "read") { setConfirmation(null); void bulk.apply(planFleetOutcomeRead(attention)); }
      else void execute(confirmation.operation,confirmation.targets,confirmation.skipped);
    }} />
  </>;
}
const styles = stylex.create({bar:{display:"flex",flexWrap:"nowrap",alignItems:"center",whiteSpace:"nowrap",minWidth:0,width:"100%",gap:vars["--aui-space-8"],padding:vars["--aui-space-8"]}});
