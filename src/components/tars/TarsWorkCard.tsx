import { useId, useState, type ReactNode } from "react";
import { ChevronRight, Ellipsis, FileText, GitBranch } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Badge } from "@/components/aui/components/Badge";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { runStyles } from "@/components/aui/components/RunMonitor";
import { StateMark } from "@/components/aui/components/StateMark";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { DailyLimitSettingsLink } from "@/components/usage/DailyLimits";
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { normalizeExternalUrl, openExternalUrl } from "@/lib/external-links";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import { tarsStateSignalId } from "@/lib/tars/attention";
import { describeTarsCardSentence, tarsCardPrimary, tarsCardStatus, tarsTaskOpens, type TarsCardPrimary } from "@/lib/tars/card-view";
import { TARS_IRREVERSIBLE_OPERATIONS } from "@/lib/tars/conversation";
import { describeTarsQueueWait, describeTarsResponsibilityDetail, describeTarsResponsibilityDiagnostic, describeTarsWorkingChanges } from "@/lib/tars/detail";
import { isTarsWorkRunning } from "@/lib/tars/live-progress";
import { describeTarsModelSelection } from "@/lib/tars/model-selection";
import { isTarsPublishable } from "@/lib/tars/publish-model";
import { tarsCardActions, type TarsCardAction, type TarsTrayAttentionInput, type TarsTrayAttentionRow, type TarsTrayCard as TarsTrayCardModel } from "@/lib/tars/tray-model";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import { TASK_USER_STATE_LABELS, taskUserStateToWorkState, type TaskUserStatus } from "@/lib/task-user-state";
import { TarsDiagnosticDetail } from "./TarsDiagnosticDetail";
import { TarsGoalSummary } from "./TarsGoalSummary";
import { TarsLiveLine, TarsRecentProgress, tarsLiveLineShows } from "./TarsLiveProgress";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { TarsRunStages, TarsStepCount, TarsWorkViews } from "./TarsRunMonitor";
import type { TarsTrayActions } from "./TarsTray";
import { tarsMonitorStyles as monitorStyles } from "./tars-monitor.styles";
import { tarsTrayStyles as styles } from "./tars-tray.styles";
import { useTarsLiveProgress } from "./use-tars-live-progress";

const CONTROL_LABEL = {
  pause: "shell:tars.pause", resume: "shell:tars.resume", takeover: "shell:tars.takeOver", handBack: "shell:tars.handBack", cancel: "shell:tars.cancel",
  acceptCompletion: "shell:tars.acceptCompletion", startNow: "shell:tars.startNow", extend: "shell:tars.extend",
  retryStage: "shell:tars.retryStage", skipStage: "shell:tars.skipStage", signOff: "shell:tars.signOff",
  approve: "shell:tars.approve", deny: "shell:tars.deny", answer: "shell:tars.answer", message: "shell:tars.message", requestChanges: "shell:tars.requestChanges",
} as const satisfies Record<TarsControlOperation, string>;

/** The kind badge and short text of one attention row; Tars's kinds get Tars's words. */
function describeAttention(row: TarsResponsibility, entry: TarsTrayAttentionRow<TarsTrayAttentionInput>) {
  const { item, decision } = entry;
  if (item.kind === "tars-decision") {
    // The row Stave adds for a ready result says so; a decision Tars proposed or asked about that result keeps its own words.
    if (item.id === tarsStateSignalId(row)) return { label: i18n.t("shell:tars.states.resultReady"), text: i18n.t("shell:tars.states.resultReady") };
    // A decision with several options is answered in the conversation; its row says what it asks.
    return { label: i18n.t("shell:tars.tray.attention.decision"), text: decision ? i18n.t(`shell:tars.tray.decision.${decision.operation}`)
      : item.detail?.trim() || i18n.t("shell:tars.tray.decision.answerInConversation") };
  }
  if (item.kind === "tars-blocked") {
    return { label: i18n.t("shell:tars.tray.attention.blocked"), text: describeTarsResponsibilityDetail(row) ?? i18n.t("shell:tars.tray.blockedDetail") };
  }
  const label = (FLEET_ATTENTION_KIND_LABEL as Readonly<Record<string, string | undefined>>)[item.kind];
  return { label: label ?? i18n.t("shell:tars.tray.attention.other"), text: item.detail?.trim() || null };
}

/** What an action is called: its control, the proposal it confirms, the Fleet row, or a queue move. */
function actionLabel(action: TarsCardAction) {
  if (action.kind === "fleet") return i18n.t("shell:tars.tray.showInFleet");
  if (action.kind === "confirm") return i18n.t(`shell:tars.tray.confirm.${action.decision.operation}`);
  if (action.kind === "move") return i18n.t(action.direction === "earlier" ? "shell:tars.tray.moveEarlier" : "shell:tars.tray.moveLater");
  return i18n.t(CONTROL_LABEL[action.operation]);
}

/** Whether a control row's action is the one the card already shows beside its state. */
function isShown(action: TarsCardAction, shown: TarsCardPrimary | null | undefined) {
  if (!shown) return false;
  if (action.kind === "control") return shown.kind === "control" && shown.operation === action.operation;
  return action.kind === "confirm" && shown.kind === "confirm" && shown.decision.messageId === action.decision.messageId && shown.decision.actionIndex === action.decision.actionIndex;
}

/**
 * The controls in a card's detail, on one line: the state's own control
 * (pause, resume, hand back) or a waiting proposal's Confirm, Open task, then
 * one menu with the rest (take over, the queue moves, Show in Fleet, Cancel
 * last). `shown` is the action the card already shows beside its state, which
 * is left out here so no control appears twice. A proposal that cannot be
 * undone wears the danger tone, as on its decision card. Every control goes
 * through the view's host action path.
 */
export function TarsCardActions({ card, actions, shown }: { card: TarsTrayCardModel; actions: TarsTrayActions; shown?: TarsCardPrimary | null }) {
  const { t } = useTranslation(["shell"]);
  const { row } = card;
  const offered = tarsCardActions(card);
  const primary = offered.primary && !isShown(offered.primary, shown) ? offered.primary : null;
  // Queue moves need the host's move path; a bridge without it offers none.
  const more = offered.more.filter((action) => (action.kind !== "move" || actions.onMove) && !isShown(action, shown));
  // The work's own task stays in reach while the card's action opens a helper's.
  const openTask = tarsTaskOpens(row) && !(shown?.kind === "openTask" && (shown.request?.taskId ?? row.taskId) === row.taskId);
  const run = (action: TarsCardAction) => {
    if (action.kind === "fleet") { if (card.fleetTarget) actions.onShowInFleet(card.fleetTarget); return; }
    if (action.kind === "move") { actions.onMove?.(row, { direction: action.direction }, "click"); return; }
    if (action.kind === "confirm") actions.onConfirm(action.decision);
    else actions.onAct(row, action.operation);
  };
  if (!primary && !openTask && !more.length) return null;
  const decision = primary?.kind === "confirm" ? primary : null;
  const moreLabel = t("shell:tars.tray.moreActions", { title: row.title });
  return <div className={sx(styles.actions)} role="group" aria-label={t("shell:tars.tray.controls", { title: row.title })} data-tars-card-actions="">
    {decision ? <Button variant={TARS_IRREVERSIBLE_OPERATIONS.has(decision.decision.operation) ? "destructive" : "default"} size="sm" disabled={actions.busy}
      data-tars-action="confirm" onClick={() => run(decision)}>{actionLabel(decision)}</Button> : null}
    {primary && !decision ? <Button variant="ghost" size="xs" disabled={actions.busy}
      data-tars-action={primary.kind === "control" ? primary.operation : primary.kind} onClick={() => run(primary)}>{actionLabel(primary)}</Button> : null}
    {openTask ? <Button variant="ghost" size="xs" onClick={() => actions.onOpenTask(row)}>{t("shell:tars.openTask")}</Button> : null}
    {more.length ? <DropdownMenu placement="bottom-end"
      trigger={<Ellipsis aria-hidden />}
      // The menu's trigger is also the hint's trigger: the hint names it on hover and keyboard focus.
      triggerProps={{ render: (props) => <Tooltip content={t("shell:tars.tray.moreActionsHint")}>
        <Button {...props} variant="ghost" size="icon-xs" aria-label={moreLabel} data-tars-more-actions={row.id} />
      </Tooltip> }}
      groups={[{ items: more.map((action) => ({ label: actionLabel(action), tone: action.kind === "control" && action.operation === "cancel" ? "danger" as const : "neutral" as const,
        disabled: action.kind !== "fleet" && actions.busy, onSelect: () => run(action) })) }]} /> : null}
  </div>;
}

/**
 * The card's one action, beside its state. What waits on the user is the
 * filled decision rung (the danger tone when it cannot be undone); every
 * other state's action is one quiet-weight secondary control.
 */
export function TarsCardPrimaryAction({ row, primary, status, actions }: { row: TarsResponsibility; primary: TarsCardPrimary; status: TaskUserStatus; actions: TarsTrayActions }) {
  const { t } = useTranslation(["shell"]);
  const waiting = status.state === "waiting";
  const look = { variant: waiting ? "default" as const : "secondary" as const, size: waiting ? "sm" as const : "xs" as const };
  switch (primary.kind) {
    case "confirm":
      return <Button variant={TARS_IRREVERSIBLE_OPERATIONS.has(primary.decision.operation) ? "destructive" : "default"} size="sm" disabled={actions.busy} xstyle={styles.cardPrimary}
        data-tars-action="confirm" data-tars-card-primary="confirm" onClick={() => actions.onConfirm(primary.decision)}>{t(`shell:tars.tray.confirm.${primary.decision.operation}`)}</Button>;
    case "control":
      return <Button {...look} disabled={actions.busy} xstyle={styles.cardPrimary} data-tars-action={primary.operation} data-tars-card-primary={primary.operation}
        onClick={() => actions.onAct(row, primary.operation)}>{t(CONTROL_LABEL[primary.operation])}</Button>;
    case "answer":
      return <Button {...look} xstyle={styles.cardPrimary} data-tars-card-primary="answer" onClick={() => actions.onAnswer?.(row)}>{t("shell:tars.tray.answer")}</Button>;
    case "openTask":
      return <Button {...look} xstyle={styles.cardPrimary} data-tars-card-primary="openTask" onClick={() => actions.onOpenTask(row, primary.request)}>{t("shell:tars.openTask")}</Button>;
    case "openReport":
      // Blocked work and a result waiting for a check open on what is unmet.
      return <Button {...look} xstyle={styles.cardPrimary} data-tars-card-primary="openReport" data-tars-open-report={row.id}
        onClick={() => actions.onOpenSide?.({ responsibilityId: row.id, kind: "report", ...(row.state === "blocked" || row.state === "resultReady" ? { focus: { unmet: true } } : {}) })}>
        {t("shell:tars.tray.openReport")}</Button>;
    case "openPullRequest":
      // The pull request opens in the browser, as every external link in Stave does.
      return <Button {...look} xstyle={styles.cardPrimary} data-tars-card-primary="openPullRequest" data-tars-publish-url={primary.url}
        title={t("shell:tars.tray.outputs.opensExternal")} onClick={() => void openExternalUrl({ url: normalizeExternalUrl(primary.url) ?? primary.url })}>
        {primary.number ? t("shell:tars.tray.openPullRequest", { number: primary.number }) : t("shell:tars.tray.openPullRequestUnnumbered")}</Button>;
  }
}

/** How many of the run's recent changes a card's detail lists; the timeline has the rest. */
const CARD_RECENT_LIMIT = 3;

/**
 * One piece of Tars work, in three lines: its title, one sentence (what it
 * does now, what it needs from the user, or what came out), then its state
 * (the task's user states) with the one action that fits it. The title
 * is a disclosure: it opens the card's detail, which holds everything else
 * Stave knows about the work and every other control.
 */
export function TarsTrayCard({ card, actions, grip }: { card: TarsTrayCardModel; actions: TarsTrayActions; grip?: ReactNode }) {
  const { t } = useTranslation(["shell"]);
  const { row, progress } = card;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const detailId = useId();
  const terminal = card.lane === "done";
  // What Stave observed: the turn's activity, how current it is, and the run's last few changes.
  const { live, now } = useTarsLiveProgress(row, card.run, { recentLimit: CARD_RECENT_LIMIT });
  const status = tarsCardStatus(card);
  const said = describeTarsCardSentence(card, status);
  const primary = tarsCardPrimary(card, status, { answer: Boolean(actions.onAnswer), report: Boolean(actions.onOpenSide) });
  const staged = progress && progress.total > 0 ? progress : null;
  const current = staged?.current ?? null;
  const queueWait = describeTarsQueueWait(row);
  // Work in progress says what Stave observes: the step its turn reported (or that nothing was observed for a while), else the stage in hand.
  const liveShows = tarsLiveLineShows(row, live);
  const liveSentence = said === null && liveShows && (Boolean(live.activity) || live.freshness === "stale" || !current);
  const sentence = said !== null ? <p className={sx(styles.cardSentence)} title={said} data-tars-queue-wait={said === queueWait ? row.queueWait?.code ?? "unknown" : undefined}>{said}</p>
    : liveSentence ? <TarsLiveLine row={row} live={live} now={now} />
      : <p className={sx(styles.cardSentence)}>{current
        ? current.attempt > 1 ? t("shell:tars.tray.monitor.currentAttempt", { title: current.title, attempt: current.attempt }) : t("shell:tars.tray.monitor.current", { title: current.title })
        : t("shell:tars.live.notStarted")}</p>;

  const modelSelection = describeTarsModelSelection(row, card.run);
  const detail = describeTarsResponsibilityDetail(row);
  // The run's own words behind a translated line, folded; the report keeps them for blocked work too.
  const diagnostic = describeTarsResponsibilityDiagnostic(row);
  const workingChanges = describeTarsWorkingChanges(row);
  // Who holds it, then what the run reported; an unknown helper count is left out, never "0".
  const facts = [
    t(card.owner === "you" ? "shell:tars.tray.owner.you" : "shell:tars.tray.owner.tars"),
    card.helpers !== null && card.helpers > 0 ? t("shell:tars.tray.helpers", { count: card.helpers }) : null,
    describeUsageShort(card.usage),
  ].filter((fact): fact is string => Boolean(fact));
  // A blocked row in the attention well already says the block's reason; the detail does not say it twice.
  const blockedEntry = card.attention.find((entry) => entry.item.kind === "tars-blocked");
  // Blocked work leads to what is unmet: from the end of the well's Blocked line when there is one, else under the detail's lines.
  const report = (row.state === "blocked" || row.state === "resultReady") && actions.onOpenSide && primary?.kind !== "openReport" ? <Button variant="ghost" size="xs" data-tars-open-report={row.id}
    onClick={() => actions.onOpenSide!({ responsibilityId: row.id, kind: "report", focus: { unmet: true } })}>
    <FileText aria-hidden />{t("shell:tars.tray.openReport")}</Button> : null;
  const controls = <TarsCardActions card={card} actions={actions} shown={primary} />;
  return <section className={sx(runStyles.card, styles.card)} aria-labelledby={titleId} data-tars-card={row.id} data-tars-lane={card.lane} data-tars-state={row.state}
    data-task-user-state={status.state} data-tars-card-open={open ? "true" : "false"} data-tars-progress={staged ? `${staged.finished}/${staged.total}` : undefined}>
    <h3 className={sx(styles.cardHeading)}>
      <Button id={titleId} variant="ghost" size="sm" layout="host" xstyle={styles.cardTitle} aria-expanded={open} aria-controls={detailId}
        data-tars-card-title="" onClick={() => setOpen((value) => !value)}>
        <span className={sx(styles.cardTitleText)}>{row.title}</span>
        <span className={sx(styles.cardChevronBox)}><ChevronRight aria-hidden className={sx(styles.chevron, transition.transform, open && styles.chevronOpen)} /></span>
      </Button>
    </h3>
    <div data-tars-card-sentence={said !== null ? "said" : liveSentence ? "live" : "stage"}>{sentence}</div>
    <div className={sx(styles.cardStateLine)}>
      {grip}
      {/* Only work that actually runs moves; queued or waiting work in Tars's hands keeps the settled mark. */}
      <span className={sx(styles.cardState)} data-tars-card-state={status.state}>
        <StateMark state={taskUserStateToWorkState(status)} size="sm" showLabel label={TASK_USER_STATE_LABELS[status.state]}
          motion={status.state === "working" && isTarsWorkRunning(row) ? "moving" : "still"} />
      </span>
      {primary ? <TarsCardPrimaryAction row={row} primary={primary} status={status} actions={actions} /> : null}
    </div>
    <div id={detailId} className={sx(styles.cardDetail, !open && styles.cardDetailHidden)} hidden={!open} data-tars-card-detail="">
      <div className={sx(runStyles.meta)}>
        <span data-tars-facts="">{facts.join(" · ")}</span>
        {/* Where the work happens is identity, so it sits with the owner: an identifier in the mono face at the meta line's size. */}
        {card.branch ? <span className={sx(styles.branch)} data-tars-branch={card.branch} title={card.branch}>
          <GitBranch aria-hidden className={sx(styles.branchIcon)} /><span className={sx(agentRunStyles.visuallyHidden)}>{t("shell:tars.tray.branch")}</span>
          <span className={sx(styles.branchName)}>{card.branch}</span></span> : null}
        {isTarsWorkRunning(row) ? <span data-tars-model-selection="" title={t("shell:tars.tray.modelSelection")}>{modelSelection ?? t("shell:tars.tray.modelPending")}</span> : null}
      </div>
      <TarsRunStages row={row} progress={progress} />
      {row.detailCode === "dailyUsageLimit" || row.detailCode === "runPaused" && row.detailParams?.reason === "usage-limit" ? <DailyLimitSettingsLink /> : null}
      <TarsGoalSummary row={row} />
      {queueWait && queueWait !== said ? <p className={sx(styles.meta)} data-tars-queue-wait={row.queueWait?.code ?? "unknown"}>{queueWait}</p> : null}
      {!staged && !terminal && row.agentRunId && !live.running ? <p className={sx(styles.meta)}>{t("shell:tars.tray.runPending")}</p> : null}
      {liveShows && !liveSentence ? <TarsLiveLine row={row} live={live} now={now} /> : null}
      {!terminal && live.recent.length ? <TarsRecentProgress entries={live.recent} now={now} title compact /> : null}
      {detail && !blockedEntry && detail !== said ? <p className={sx(styles.meta)}>{detail}</p> : null}
      {diagnostic ? <TarsDiagnosticDetail text={diagnostic} /> : null}
      {row.reverifyAfter && !terminal ? <p className={sx(styles.meta)}>{t("shell:tars.reverify")}</p> : null}
      {workingChanges ? <p className={sx(styles.meta)} data-tars-working-changes={row.workingChanges!.kind}>{workingChanges}</p> : null}
      {card.followUp ? <p className={sx(styles.meta)} data-tars-follow-up-state={card.followUp.status}>
        {t(`shell:tars.tray.followUp.${card.followUp.status}`, { time: card.followUp.at ? formatDateTime(card.followUp.at) : "" })}</p> : null}
      {/* What the work waits on is "now", so it sits in the run object's recessed well (AUI RunMonitor's decision well):
          each item says what kind of wait it is on a short label line, then its text across the card's full width. */}
      {card.attention.length ? <ul className={sx(runStyles.well, styles.attention)} data-tars-attention-list={card.attention.length}>
        {card.attention.map((entry) => {
          const { label, text } = describeAttention(row, entry);
          const irreversible = entry.decision && TARS_IRREVERSIBLE_OPERATIONS.has(entry.decision.operation)
            ? <Badge size="sm" tone="danger" variant="outlined" xstyle={styles.attentionEnd} data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge> : null;
          // A Tars decision's text already says what Tars proposes, so the row keeps one named mark instead of repeating a label.
          if (entry.item.kind === "tars-decision") {
            return <li key={entry.item.id} className={sx(styles.attentionRow, styles.attentionInline)} data-tars-attention={entry.item.kind}>
              <span className={sx(styles.attentionMarkBox)}><StatusDot tone="warning" size="sm" aria-label={label} xstyle={monitorStyles.attentionMark} data-tars-attention-mark="" /></span>
              {text ? <span className={sx(styles.attentionText, styles.attentionInlineText)}>{text}</span> : null}
              {irreversible}
            </li>;
          }
          return <li key={entry.item.id} className={sx(styles.attentionRow)} data-tars-attention={entry.item.kind}>
            <span className={sx(styles.attentionHead)}>
              <StatusDot tone="warning" size="sm" xstyle={monitorStyles.attentionMark} />
              <span className={sx(monitorStyles.attentionLabel)}>{label}</span>
              {irreversible}
              {report && entry === blockedEntry ? <span className={sx(styles.attentionEnd)}>{report}</span> : null}
            </span>
            {text ? <span className={sx(styles.attentionText)}>{text}</span> : null}
          </li>;
        })}
      </ul> : null}
      {report && !blockedEntry ? <div className={sx(styles.actions)}>{report}</div> : null}
      {/* Follow up selects this work for the next message; nothing is sent. */}
      {actions.onFollowUp ? <div className={sx(styles.actions)}><Button variant="ghost" size="xs" data-tars-select-work={row.id}
        onClick={() => actions.onFollowUp!(row)}>{t("shell:tars.selection.followUp")}</Button></div> : null}
      {/* Completed work leads to its draft pull request: the link once open, else the button that opens its confirmation card. */}
      {(row.publication || ((row.state === "completed" || row.state === "resultReady") && actions.onPublish && isTarsPublishable(row))) ? <div className={sx(styles.actions)} data-tars-card-publish="">
        <TarsPublishEntry row={row} onPublish={actions.onPublish} />
      </div> : null}
      <div className={sx(styles.cardDetailFoot)} data-tars-card-detail-foot="">
        {controls}
        <span className={sx(styles.cardDetailSpacer)} />
        <TarsStepCount progress={progress} />
        {actions.onOpenSide ? <TarsWorkViews row={row} progress={progress} onOpenSide={actions.onOpenSide} /> : null}
      </div>
    </div>
  </section>;
}
