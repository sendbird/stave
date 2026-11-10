import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ListTodo, Settings, X } from "lucide-react";
import { TarsGuideButton } from "./TarsGuide";
import { TarsInsights } from "./TarsInsights";
import { TarsMark } from "./TarsMark";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { sx } from "@/components/aui/utils/stylex";
import { GlobalPageHeader } from "@/components/system/GlobalPageHeader";
import { panelBarStyles } from "@/components/layout/panel-bar.constants";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { openFleetAt } from "@/store/fleet-focus-store";
import { publishTarsSnapshot } from "@/store/tars-snapshot-store";
import type { TarsFollowUpState, TarsResponsibility } from "@/lib/tars/types";
import {
  tarsConfirmationRequestId, type TarsActInput, type TarsActResult, type TarsAnswerInput, type TarsControlOperation, type TarsConversationSettings, type TarsQueueMove,
  type TarsQueueMoveSource,
} from "@/lib/tars/conversation";
import { tarsQueueOf } from "@/lib/tars/queue-order";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { buildTarsFlow, isAppliedDelegateReceipt, tarsRunOf } from "@/lib/tars/flow-model";
import { buildTarsRecap, buildTarsTray, tarsTrayNextFollowUpChange, tarsTrayStatus, type TarsTrayDecision } from "@/lib/tars/tray-model";
import { buildTarsRuntimeHints } from "@/lib/tars/runtime-hints";
import { buildTarsOutputs } from "@/lib/tars/outputs-model";
import { projectTarsDecisions, tarsUnverifiedDecisionId } from "@/lib/tars/decisions";
import { isTarsSideViewEscape, selectNewTarsShowRequests, settleTarsShowRequest, tarsSideViewPlacement, type TarsPendingShow, type TarsSideViewTarget } from "@/lib/tars/side-view";
import { useTars } from "./use-tars";
import { useTarsConversation } from "./use-tars-conversation";
import { useTarsTrayPinned } from "./use-tars-tray-pinned";
import { tarsStyles as styles } from "./tars.styles";
import { tarsTrayStyles as trayStyles } from "./tars-tray.styles";
import { TarsConversation, type TarsConversationController, type TarsFlowContext } from "./TarsConversation";
import { TarsSideView } from "./TarsSideView";
import type { TarsBriefLoader } from "./use-tars-brief";
import { TarsBlockedNextSteps } from "./TarsBlockedNextSteps";
import { TarsResultProvider } from "./TarsResultCard";
import { useTarsExecutionPath, useTarsRunDetails } from "./use-tars-run-details";
import { TarsSettings } from "./TarsSettings";
import { TarsTray, TarsTrayStatusNote, TarsTrayToggle, type TarsTrayActions } from "./TarsTray";
import { TarsAwayRecap } from "./TarsAwayRecap";
import { useTarsAwayWindow } from "./use-tars-away";
import { useTarsPublish } from "./use-tars-publish";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { TarsLiveLineFor, TarsRunningStrip } from "./TarsLiveProgress";
import { isTarsWorkRunning } from "@/lib/tars/live-progress";
import { isTarsResponsibilityTerminal } from "@/lib/tars/attention";
import { tarsControlFailureKey, tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { listAgents } from "@/lib/agents/library";
import { getAgentDisplayName } from "@/lib/agents/display";
import { isTarsTrayPinned, type TarsViewSettings } from "@/lib/tars/clearing";
import { isTarsNewProfile } from "@/lib/tars/default-instructions";
import { buildTarsSuggestions } from "@/lib/tars/suggestions";
import { TarsClearConversationButton, type TarsClearCounts } from "./TarsClear";
import { useTarsClear } from "./use-tars-clear";
import type { TarsTrayClearing } from "./TarsTray";
import { focusTarsTrayLane, TarsStartContext, type TarsStartInfo } from "./TarsStart";
import { buildTarsStartCounts, listTarsStartRepositories } from "@/lib/tars/start";
import { useTarsSchedules } from "./use-tars-schedules";
import { TarsSchedulesSection } from "./TarsSchedulesSection";

const NO_RESPONSIBILITIES: TarsResponsibility[] = [];

/** The header indicator's button: the tray's own opener. */
function trayIndicator() {
  return document.querySelector("[data-testid='tars-view'] [data-tars-tray-indicator]")?.closest("button") ?? null;
}

/**
 * The time follow-up lines are judged at. It moves when the host reports new
 * follow-ups and again when the next shown time arrives, so a next check or
 * a deferral never stays on screen after its time.
 */
function useFollowUpClock(followUps: readonly TarsFollowUpState[] | undefined) {
  const [tick, setTick] = useState(0);
  // Recomputed on purpose whenever the follow-ups or the timer change.
  const now = useMemo(() => new Date().toISOString(), [followUps, tick]);
  useEffect(() => {
    const next = tarsTrayNextFollowUpChange(followUps ?? [], now);
    if (!next) return;
    const timer = setTimeout(() => setTick((value) => value + 1), Math.max(0, Date.parse(next) - Date.now()) + 250);
    return () => clearTimeout(timer);
  }, [followUps, now]);
  return now;
}

export function TarsView() {
  const { t } = useTranslation(["shell"]);
  const close = useAppStore((state) => state.closeTars);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const exitToWorkspace = useAppStore((state) => state.exitToWorkspace);
  const appSettings = useAppStore((state) => state.settings);
  const agentNames = useMemo(() => new Map(listAgents({ custom: appSettings.customAgents, activeOnly: false })
    .map((agent) => [agent.id, getAgentDisplayName(agent)])), [appSettings.customAgents]);
  const availability = useAppStore((state) => state.providerAvailability);
  // The tray reads Fleet's own rows and runs, so its "needs you" can never disagree with Fleet.
  const attentionItems = useFleetAttention((snapshot) => snapshot.items);
  const fleetRuns = useFleetAgentRunsStore((state) => state.details);
  const api = typeof window !== "undefined" ? window.api?.tars : undefined;
  const { snapshot, error, busy, command, refresh } = useTars(api);
  const conversation = useTarsConversation(api);
  const { ref: viewRef, pinned, size } = useTarsTrayPinned();
  const controller = useRef<TarsConversationController>(null);
  // The side view is view-only: opening, switching and closing are never recorded in the conversation.
  const [side, setSide] = useState<{ target: TarsSideViewTarget; takeFocus: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const shown = useRef<ReadonlySet<string> | null>(null);
  const pendingShow = useRef<TarsPendingShow | null>(null);
  const trayId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Showing or folding the tray is view-only: never recorded in the conversation.
  const [pinnedTrayOpen, setPinnedTrayOpen] = useState(true);
  const [trayPopoverOpen, setTrayPopoverOpen] = useState(false);
  const [openError, setOpenError] = useState(false);
  // A retried click keeps its request ID, so a lost acknowledgement cannot apply twice.
  const clicks = useRef(new Map<string, string>());
  // What the last queue move did, for screen readers; the record line says it in the conversation too.
  const [queueNotice, setQueueNotice] = useState("");
  // The conversation's reasoning model and account. Execution has no pin here, so delegated work routes automatically.
  const initialSettings = useMemo<TarsConversationSettings>(() => {
    const providerId = availability.codex || !availability["claude-code"] ? "codex" : "claude-code";
    return { providerId, model: providerId === "codex" ? appSettings.modelCodex : appSettings.modelClaude, maxTurns: 30, runtimeHints: buildTarsRuntimeHints(providerId, appSettings) };
  }, [appSettings, availability]);
  const responsibilities = snapshot?.responsibilities ?? NO_RESPONSIBILITIES;
  const runs = useTarsRunDetails(responsibilities, fleetRuns);
  const cleared = snapshot?.cleared;
  const outputs = useMemo(() => buildTarsOutputs({ responsibilities, runs, cleared: cleared?.outputs }), [cleared?.outputs, responsibilities, runs]);
  const sideRow = side ? responsibilities.find((row) => row.id === side.target.responsibilityId) : undefined;
  const sideCwd = useTarsExecutionPath(sideRow);
  const followUpNow = useFollowUpClock(snapshot?.followUps);
  const tray = useMemo(() => buildTarsTray({ responsibilities, attentionItems, runs, pendingDecisions: snapshot?.pendingDecisions,
    followUps: snapshot?.followUps, now: followUpNow, clearedDone: cleared?.done }),
    [attentionItems, cleared?.done, responsibilities, runs, snapshot?.pendingDecisions, snapshot?.followUps, followUpNow]);
  const trayStatus = tarsTrayStatus({ bridge: Boolean(api), snapshot, error });
  const workspaces = useAppStore((state) => state.workspaces);
  const away = useTarsAwayWindow();
  const records = conversation.conversation?.records;
  // A cancel the user applied is theirs, not work that failed while they were away.
  const recap = useMemo(() => buildTarsRecap({ model: tray, since: away.since, until: away.until, pendingDecisions: snapshot?.pendingDecisions,
    cancelledByYou: new Set((records ?? []).filter((record) => record.status === "applied" && record.action.kind === "control" && record.action.operation === "cancel").map((record) => record.action.responsibilityId)) }),
  [away.since, away.until, records, snapshot?.pendingDecisions, tray]);
  const rowOf = useCallback((id: string) => responsibilities.find((row) => row.id === id), [responsibilities]);
  const workspaceNameOf = useCallback((id: string) => workspaces.find((workspace) => workspace.id === id)?.name, [workspaces]);
  /** Opens the side view and remembers what opened it, so closing returns focus there. */
  const openSide = useCallback((target: TarsSideViewTarget, takeFocus = true) => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // An opener in the narrow tray's popover goes away as the popover closes; its indicator stands in for it.
    // Opened by words, nothing was pressed: closing returns focus to the composer.
    opener.current = !takeFocus ? null : active?.closest("[role='dialog']") ? trayIndicator() : active;
    setTrayPopoverOpen(false);
    setSide({ target, takeFocus });
  }, []);
  const closeSide = useCallback(() => {
    setSide(null);
    const back = opener.current;
    opener.current = null;
    // An opener that has gone since (or is hidden), or none at all, hands focus to the composer.
    requestAnimationFrame(() => {
      if (back?.isConnected && back.checkVisibility()) back.focus();
      else controller.current?.focusComposer();
    });
  }, []);
  // "Show me the report": a show action the host admitted opens the side view once; reading the conversation again never replays it.
  const receipts = conversation.conversation?.receipts;
  useEffect(() => {
    if (!receipts) return;
    const { requests, seen } = selectNewTarsShowRequests(receipts, shown.current);
    shown.current = seen;
    // A show can arrive before the snapshot that holds its responsibility: it waits for that snapshot, briefly, instead of being dropped.
    const settled = settleTarsShowRequest({ pending: pendingShow.current, incoming: requests.at(-1) ?? null,
      responsibilityIds: snapshot ? new Set(responsibilities.map((row) => row.id)) : null, now: Date.now() });
    pendingShow.current = settled.pending;
    if (settled.open) openSide(settled.open, false);
  }, [openSide, receipts, responsibilities, snapshot]);
  // A responsibility that left the snapshot takes its side view with it.
  useEffect(() => { if (side && snapshot && !sideRow) setSide(null); }, [side, sideRow, snapshot]);
  const flows = useMemo<TarsFlowContext>(() => ({
    flowFor: (receipt) => {
      if (!isAppliedDelegateReceipt(receipt)) return null;
      const row = responsibilities.find((candidate) => candidate.id === receipt.responsibilityId);
      return buildTarsFlow({ receipt, row, run: tarsRunOf(row, runs) });
    },
    onShowInFleet: openFleetAt,
    onOpenSide: openSide,
    liveFor: (responsibilityId) => {
      const row = responsibilities.find((candidate) => candidate.id === responsibilityId);
      return row && !isTarsResponsibilityTerminal(row) ? <TarsLiveLineFor row={row} run={tarsRunOf(row, runs)} /> : null;
    },
  }), [openSide, responsibilities, runs]);
  // The work that actually runs now, oldest first, for the composer band; queued, paused and waiting work is not in it.
  const running = useMemo(() => responsibilities.filter(isTarsWorkRunning).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((row) => ({ row, run: tarsRunOf(row, runs) })), [responsibilities, runs]);
  const decisions = useMemo(() => conversation.conversation && snapshot ? projectTarsDecisions({ messages: conversation.conversation.messages,
    receipts: conversation.conversation.receipts, records: conversation.conversation.records, answers: conversation.conversation.answers ?? [],
    activity: conversation.conversation.activity, responsibilities }) : [], [conversation.conversation, responsibilities, snapshot]);
  /** Opens a task of the work: its own, or the one a request waits in (a helper's), in the work's repository. */
  async function openTask(row: Pick<TarsResponsibility, "repositoryPath">, taskId: string, workspaceId: string) {
    try {
      await focusTaskAttention({ taskId, workspaceId, repositoryPath: row.repositoryPath, refreshFromPersistence: true });
      if (!useAppStore.getState().tasks.some((task) => task.id === taskId)) throw new Error();
      exitToWorkspace("tars");
    } catch { setOpenError(true); }
  }
  async function open(row: TarsResponsibility) {
    if (row.taskId) await openTask(row, row.taskId, row.executionWorkspaceId ?? row.workspaceId);
  }
  const openRequestTask = (target: { responsibilityId: string; taskId: string; workspaceId: string }) => {
    const row = rowOf(target.responsibilityId);
    if (row) void openTask(row, target.taskId, target.workspaceId);
  };
  async function submit(input: Omit<TarsActInput, "source">) {
    const done = await command(async (bridge) => {
      try { return (await bridge.act({ ...input, source: "click" })).snapshot; }
      // Show translated advice, not the transport or host diagnostic.
      catch (cause) { throw new Error(t(tarsControlFailureKey(cause))); }
    });
    void conversation.refresh();
    return done;
  }
  async function act(row: TarsResponsibility, operation: TarsControlOperation) {
    const key = `${row.id}:${row.revision}:${operation}`;
    const requestId = clicks.current.get(key) ?? crypto.randomUUID();
    clicks.current.set(key, requestId);
    if (await submit({ requestId, responsibilityId: row.id, expectedRevision: row.revision, operation })) clicks.current.delete(key);
  }
  /**
   * Moves queued work through the host's reprioritize path. An unchanged
   * retry reuses its request ID, so a lost reply applies once; the result is
   * announced, and focus returns to the card's grip or menu when the move
   * took the focused control out of the document.
   */
  async function moveInQueue(row: TarsResponsibility, move: TarsQueueMove, source: TarsQueueMoveSource) {
    const key = `${row.id}:${row.revision}:${move.direction}:${move.relativeTo ?? ""}:${source}`;
    const requestId = clicks.current.get(key) ?? crypto.randomUUID();
    clicks.current.set(key, requestId);
    const active = document.activeElement;
    const focusGrip = active instanceof HTMLElement && active.dataset.tarsQueueGrip === row.id;
    let result: TarsActResult | null = null;
    const done = await command(async (bridge) => {
      if (!bridge.reprioritize) throw new Error(t("shell:tars.controlReasons.unknown"));
      try { result = await bridge.reprioritize({ requestId, responsibilityId: row.id, expectedRevision: row.revision, move, source }); return result.snapshot; }
      catch (cause) { throw new Error(t(tarsControlFailureKey(cause))); }
    });
    void conversation.refresh();
    if (done) clicks.current.delete(key);
    const settled = result as TarsActResult | null;
    if (settled) {
      const queue = tarsQueueOf(settled.snapshot.responsibilities);
      const text = settled.record.status === "applied"
        ? t("shell:tars.tray.reorder.moved", { title: row.title, position: queue.findIndex((entry) => entry.id === row.id) + 1, total: queue.length })
        : t("shell:tars.tray.reorder.refused", { title: row.title, reason: t(tarsControlReasonKey(settled.record.reason)) });
      // The same words twice would not be read again; a trailing no-break space makes the second one a change.
      setQueueNotice((current) => current === text ? `${text}\u00a0` : text);
    }
    if (source === "drag") return;
    // Two frames: the reordered tray has rendered by then.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const id = CSS.escape(row.id);
      (document.querySelector<HTMLElement>(focusGrip ? `[data-tars-queue-grip="${id}"]` : `[data-tars-more-actions="${id}"]`)
        ?? document.querySelector<HTMLElement>(`[data-tars-card="${id}"] button`))?.focus();
    }));
  }
  /** Confirms a proposed control at the revision it was proposed for; its request ID makes it apply once, from the tray or the message. */
  function confirmDecision(decision: TarsTrayDecision) {
    void submit({ requestId: tarsConfirmationRequestId(decision.messageId, decision.actionIndex), responsibilityId: decision.responsibilityId,
      expectedRevision: decision.expectedRevision, operation: decision.operation });
  }
  /** A card's answer: its decision id makes a retry apply once; the snapshot is read again so Fleet and the tray follow. */
  async function answer(input: TarsAnswerInput) {
    const result = await conversation.answer(input);
    void refresh();
    return result;
  }
  // Publish cards: Tars's own proposals in the conversation, and the one card "Create draft PR" opens at its end.
  const publishing = useTarsPublish({ bridge: api, conversation: conversation.conversation, responsibilities: snapshot ? responsibilities : null,
    refresh: () => { void refresh(); void conversation.refresh(); }, focusComposer: () => controller.current?.focusComposer() });
  const openPublish = publishing.available ? (row: TarsResponsibility) => { setTrayPopoverOpen(false); publishing.openCard(row); } : undefined;
  // Schedules Tars set up: their cards and records in the conversation, and their list under the tray's lanes.
  const scheduling = useTarsSchedules({ bridge: api, conversation: conversation.conversation, refresh: () => { void conversation.refresh(); },
    focusComposer: () => controller.current?.focusComposer() });
  const schedulesSection = scheduling.available ? <TarsSchedulesSection context={scheduling.context} onOpenSchedules={() => useAppStore.getState().openAutomationCenter()} /> : null;
  // "Show my schedules" opens the tray the list is in; the section itself unfolds and scrolls into view.
  const listRequests = scheduling.context.listRequests;
  const seenListRequests = useRef<number | null>(null);
  useEffect(() => {
    const previous = seenListRequests.current;
    if (!conversation.conversation) return;
    seenListRequests.current = listRequests;
    if (previous === null || listRequests <= previous) return;
    setSide(null);
    if (pinned) setPinnedTrayOpen(true); else setTrayPopoverOpen(true);
  }, [conversation.conversation, listRequests, pinned]);
  // What a clear would hide now: settled messages, and ended work that is not waiting on a draft PR.
  const waitingPublish = useMemo(() => new Set(publishing.context.proposals.filter((view) => view.state === "waiting").map((view) => view.responsibilityId)),
    [publishing.context.proposals]);
  const clearCounts = useMemo<TarsClearCounts>(() => {
    const clearable = (row: TarsResponsibility) => isTarsResponsibilityTerminal(row) && !isTarsTrayPinned(row, waitingPublish);
    return {
      conversation: (conversation.conversation?.messages ?? []).filter((message) => message.state !== "queued" && message.state !== "reasoning").length,
      done: tray.lanes.done.filter((card) => clearable(card.row)).length,
      outputs: new Set(outputs.filter((output) => { const row = rowOf(output.responsibilityId); return row && clearable(row); }).map((output) => output.responsibilityId)).size,
    };
  }, [conversation.conversation?.messages, outputs, rowOf, tray.lanes.done, waitingPublish]);
  const announce = useCallback((text: string) => setQueueNotice((current) => current === text ? `${text}\u00a0` : text), []);
  const clearing = useTarsClear({ bridge: api, conversation: conversation.conversation, counts: clearCounts, announce,
    refresh: () => { void refresh(); void conversation.refresh(); } });
  // Hidden outputs count only ended work that produced some: a clear also archives ended work with none, which hides nothing.
  const hiddenOutputs = useMemo(() => {
    const ids = new Set(cleared?.outputs ?? []);
    return new Set(buildTarsOutputs({ responsibilities: responsibilities.filter((row) => ids.has(row.id)), runs }).map((output) => output.responsibilityId)).size;
  }, [cleared?.outputs, responsibilities, runs]);
  const laneClearing = (scope: "done" | "outputs") => {
    const latest = clearing.latest(scope);
    return { clearable: clearCounts[scope], hidden: scope === "done" ? cleared?.done.length ?? 0 : hiddenOutputs,
      onUndo: latest ? () => void clearing.undo(latest.requestId) : null, error: clearing.errors.get(scope) ?? (latest ? clearing.errors.get(latest.requestId) : null) ?? null };
  };
  const trayClearing: TarsTrayClearing | undefined = clearing.available ? { busy: clearing.busy, done: laneClearing("done"), outputs: laneClearing("outputs"),
    onClear: (scope) => void clearing.clear([scope], "click") } : undefined;
  // Suggested requests from the work as it is now; none before the work was read.
  const suggestions = useMemo(() => buildTarsSuggestions({ tray: snapshot ? tray : null, messages: conversation.conversation?.messages ?? [],
    receipts: conversation.conversation?.receipts ?? [], now: followUpNow }), [conversation.conversation?.messages, conversation.conversation?.receipts, followUpNow, snapshot, tray]);
  // The start screen's facts: the tray's own counts, and the repositories the app has registered.
  const registered = useAppStore((state) => state.recentRepositories);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const repositoryName = useAppStore((state) => state.repositoryName);
  const startCounts = useMemo(() => buildTarsStartCounts({ tray: snapshot ? tray : null, now: followUpNow }), [followUpNow, snapshot, tray]);
  const startRepositories = useMemo(() => listTarsStartRepositories({ registered, current: { repositoryPath, repositoryName } }), [registered, repositoryName, repositoryPath]);
  // A profile that never used Tars starts with the default standing instructions, once; anyone else is offered them in settings.
  const seeded = useRef(false);
  const settingsRead = conversation.conversation ? conversation.conversation.settings : undefined;
  useEffect(() => {
    if (seeded.current || !api || !snapshot || settingsRead === undefined || !isTarsNewProfile(snapshot.identity, settingsRead)) return;
    seeded.current = true;
    // The saved identity is the new snapshot; a read already under way could otherwise leave the old one on screen.
    void api.updateIdentity({ name: snapshot.identity.name, instructions: t("shell:tars.instructionsDefault") }).then(publishTarsSnapshot).catch(() => undefined);
  }, [api, settingsRead, snapshot, t]);
  const trayActions: TarsTrayActions = { busy, onAct: (row, operation) => void act(row, operation), onConfirm: confirmDecision,
    onOpenTask: (row) => void open(row), onShowInFleet: openFleetAt, onOpenSide: openSide, onPublish: openPublish,
    ...(api?.reprioritize ? { onMove: (row: TarsResponsibility, move: TarsQueueMove, source: TarsQueueMoveSource) => void moveInQueue(row, move, source) } : {}) };
  // "No work" only after a successful read; before it, or after a failed one, the tray says which.
  const trayBody = trayStatus !== "ready" ? <TarsTrayStatusNote status={trayStatus} />
    : <>{responsibilities.length ? <>
      {recap && !away.dismissed ? <TarsAwayRecap recap={recap} onOpenSide={openSide} onDismiss={away.dismiss} /> : null}
      <TarsTray model={tray} actions={trayActions} outputs={outputs} clearing={trayClearing} surface={pinned ? "canvas" : "raised"} />
    </> : <p className={sx(styles.text)}>{t("shell:tars.conversation.noWork")}</p>}{schedulesSection}</>;
  // Wide, the side view takes the tray's column and the tray folds to its indicator until the side view closes.
  const trayOpen = pinned ? pinnedTrayOpen && !side : trayPopoverOpen;
  const onTrayOpenChange = (next: boolean) => {
    if (!pinned) { setTrayPopoverOpen(next); return; }
    if (side) { closeSide(); setPinnedTrayOpen(true); } else setPinnedTrayOpen(next);
  };
  // The newest opener, for a handler that outlives this render.
  const openTray = useRef(() => onTrayOpenChange(true));
  openTray.current = () => onTrayOpenChange(true);
  // A start-screen count shows its lane in the tray, as the tray's own indicator would, and moves focus there.
  const startInfo = useMemo<TarsStartInfo>(() => ({ counts: startCounts, repositories: startRepositories, canPublish: publishing.available, canClear: clearing.available, canSchedule: scheduling.available,
    onOpenCount: (count) => { openTray.current(); focusTarsTrayLane(count.lane, count.responsibilityId); } }),
  [clearing.available, publishing.available, scheduling.available, startCounts, startRepositories]);
  const placement = tarsSideViewPlacement(size ?? { width: 0, height: 0 });
  // The bridge object never changes, so the request view reads again only when its work changes.
  const loadBrief = useMemo<TarsBriefLoader | undefined>(() => api?.getBrief ? (input) => api.getBrief!(input) : undefined, [api]);
  const sideView = side && sideRow ? <TarsSideView target={side.target} row={sideRow} run={tarsRunOf(sideRow, runs)} cwd={sideCwd}
    placement={pinned ? { placement: "column" } : { placement: "inline", maxHeight: placement.placement === "inline" ? placement.maxHeight : 0 }}
    records={conversation.conversation?.records.filter((record) => record.action.responsibilityId === sideRow.id) ?? []}
    publishAction={sideRow.state === "completed" ? <TarsPublishEntry row={sideRow} onPublish={openPublish} /> : undefined} loadBrief={loadBrief}
    takeFocus={side.takeFocus} onClose={closeSide} onKind={(kind) => setSide({ target: { responsibilityId: sideRow.id, kind }, takeFocus: false })}
    onQuote={(text) => controller.current?.insert(text)}
    blockedActions={sideRow.state !== "blocked" ? undefined : <TarsBlockedNextSteps row={sideRow} actions={trayActions} titleOf={(id) => responsibilities.find((row) => row.id === id)?.title}
      rowOf={rowOf} workspaceNameOf={workspaceNameOf}
      decision={decisions.find((view) => view.id === tarsUnverifiedDecisionId(sideRow.id, sideRow.revision) && view.state === "waiting")}
      onAnswer={(view, index, source) => controller.current?.answer(view, index, source)} />} /> : null;
  // Esc anywhere in the view closes the side view, unless something nearer (a menu, a palette) used it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!side || !isTarsSideViewEscape({ key: event.key, defaultPrevented: event.defaultPrevented, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) return;
    event.preventDefault();
    closeSide();
  };
  return <div ref={viewRef} className={sx(styles.root, textWrap.keepAll)} data-testid="tars-view" data-tars-tray-pinned={pinned ? "true" : "false"} onKeyDown={onKeyDown}>
    <GlobalPageHeader title={snapshot?.identity.name ?? t("shell:tars.title")} titleIcon={<TarsMark />} actions={<div className={sx(styles.actions)}>
      <TarsTrayToggle pinned={pinned} counts={tray.counts} status={trayStatus} outputs={outputs.length} open={trayOpen} onOpenChange={onTrayOpenChange} panelId={trayId}>{trayBody}</TarsTrayToggle>
      <TarsGuideButton onExample={(text) => controller.current?.insert(text)} />
      <TarsInsights identity={snapshot?.identity ?? null} settings={conversation.conversation?.settings ?? null} bridge={api} onEditSettings={() => setSettingsOpen(true)}
        onOpenWork={(id) => { const row = rowOf(id); if (row) openSide({ responsibilityId: id, kind: row.agentRunId ? "timeline" : "brief" }); }} />
      {clearing.available ? <TarsClearConversationButton count={clearCounts.conversation} busy={clearing.busy}
        error={clearing.errors.get("conversation") ?? null} onClear={() => clearing.clear(["conversation"], "click")} /> : null}
      <Button variant="ghost" size="icon-sm" disabled={!snapshot} aria-label={t("shell:tars.conversation.settings")} title={t("shell:tars.conversation.settings")} onClick={() => setSettingsOpen(true)}><Settings /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={t("shell:tars.close")} onClick={close}><X /></Button>
    </div>} />
    {error || openError ? <div role="alert" className={sx(styles.errorBar)}><p>{error ?? t("shell:tars.openFailed")}</p><Button variant="secondary" size="xs" onClick={() => { setOpenError(false); void refresh(); }}>{t("shell:tars.retry")}</Button></div> : null}
    <div className={sx(styles.workspace)}>
      {/* A notice for ended work reads the work, its run and the tray's handlers from here, to show its result card. */}
      <TarsResultProvider responsibilities={responsibilities} runs={runs} activity={conversation.conversation?.activity} records={records} actions={trayActions}
        agentNameOf={(id) => agentNames.get(id)}>
      <TarsStartContext value={startInfo}><TarsConversation state={conversation} name={snapshot?.identity.name ?? t("shell:tars.title")} initialSettings={initialSettings} floor={pinned && (pinnedTrayOpen || Boolean(sideView))}
        titleOf={(id) => responsibilities.find((row) => row.id === id)?.title} rowOf={rowOf} workspaceNameOf={workspaceNameOf} onOpenTask={openRequestTask} agentNameOf={(id) => agentNames.get(id)} flows={flows}
        responsibilities={snapshot ? responsibilities : null} onAnswer={answer} controller={controller} sidePanel={pinned ? null : sideView}
        publish={publishing.available ? publishing.context : undefined} draftBridge={api} clear={clearing.available ? clearing : undefined} suggestions={suggestions}
        schedule={scheduling.available ? scheduling.context : undefined} onOpenScheduleRun={(run) => { if (run.taskId) void openTask(run, run.taskId, run.workspaceId); }}
        composerStatus={<TarsRunningStrip items={running} onOpenSide={openSide} onShowAll={() => onTrayOpenChange(true)} />} /></TarsStartContext>
      </TarsResultProvider>
      {pinned ? sideView : null}
      {/* Folded, not removed, while the side view has its column: what opened the side view is still there to take focus back. */}
      {pinned && pinnedTrayOpen ? <aside id={trayId} hidden={Boolean(sideView)} className={sx(trayStyles.panel, Boolean(sideView) && trayStyles.panelFolded)} aria-labelledby={`${trayId}-title`} data-tars-tray-panel="">
        <div className={sx(trayStyles.panelHeader, panelBarStyles.bar)}><h2 id={`${trayId}-title`} className={sx(panelBarStyles.headerTitle, trayStyles.panelTitle)}>
          <ListTodo aria-hidden className={sx(panelBarStyles.headerIcon)} />{t("shell:tars.tray.title")}</h2></div>
        <div className={sx(trayStyles.panelBody)}>{trayBody}</div>
      </aside> : null}
    </div>
    <VisuallyHidden aria-live="polite" role="status" data-tars-queue-notice="">{queueNotice}</VisuallyHidden>
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}><SheetContent><SheetHeader><SheetTitle>{t("shell:tars.conversation.settings")}</SheetTitle><SheetDescription>{t("shell:tars.conversation.settingsDescription")}</SheetDescription></SheetHeader>
      {snapshot && settingsOpen ? <TarsSettings identity={snapshot.identity} initial={conversation.conversation?.settings ?? initialSettings} busy={busy || conversation.busy}
        view={api?.configureView && conversation.conversation?.view ? { retentionDays: conversation.conversation.view.retentionDays } : null} onSave={async (identity, settings, view: TarsViewSettings | null) => {
        const saved = await conversation.configure(settings);
        if (!saved) return false;
        if (view && view.retentionDays !== conversation.conversation?.view?.retentionDays) {
          try { await api!.configureView!(view); } catch { return false; }
        }
        const success = await command((bridge) => bridge.updateIdentity(identity));
        if (success) setSettingsOpen(false);
        return success;
      }} /> : null}
    </SheetContent></Sheet>
  </div>;
}
