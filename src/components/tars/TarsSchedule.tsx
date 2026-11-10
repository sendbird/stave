import { useId, type KeyboardEvent } from "react";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { Badge } from "@/components/aui/components/Badge";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import {
  describeTarsScheduleNextRuns, describeTarsScheduleRule, describeTarsScheduleWorkspace, tarsScheduleOutcomeKey, tarsScheduleReasonKey,
} from "@/lib/tars/schedule-view";
import type {
  TarsScheduleFacts, TarsSchedulePreview, TarsScheduleProposalView, TarsScheduleRecord, TarsScheduleRun, TarsScheduleSource,
} from "@/lib/tars/schedules";
import { useTarsDirectActor } from "./TarsActionRecordLine";
import { TarsCardDetails } from "./TarsDecisionCard";
import { tarsPublishCardKey } from "./TarsPublishCard";
import { TarsRecordChip, TarsRecordDetail, TarsRecordDiagnostic, TarsRecordList, TarsRecordRow, type TarsRecordState } from "./TarsRecord";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import type { TarsScheduleContext, TarsSchedulePreviewState } from "./use-tars-schedules";

const RECORD_STATE: Record<TarsScheduleRecord["status"], TarsRecordState> = { applied: "applied", pending: "running", rejected: "refused" };
const RUN_STATE: Record<TarsScheduleRun["status"], TarsRecordState> = { running: "running", waiting: "proposed", completed: "applied", failed: "failed", skipped: "skipped" };

/**
 * One confirmation or switch of a schedule as a record row, never a user
 * message: the user confirmed it, so it carries their glyph. It says what was
 * done to which schedule, when it runs next (with the zone) or why it was not
 * applied.
 */
export function TarsScheduleRecordLine({ record, fallbackTitle }: { record: TarsScheduleRecord; fallbackTitle?: string }) {
  const { t } = useTranslation(["shell"]);
  const actorOf = useTarsDirectActor();
  const summary = record.summary;
  const title = summary?.title ?? fallbackTitle;
  const next = summary?.enabled && summary.nextRuns.length ? describeTarsScheduleNextRuns(summary.nextRuns, summary.timezone, new Date(record.createdAt)) : null;
  return <TarsRecordRow state={RECORD_STATE[record.status]} icon={CalendarClock} actor={actorOf(record.source)} lead={t(tarsScheduleOutcomeKey(record))} at={record.createdAt}
    data-tars-schedule-record={record.status} data-tars-schedule-operation={record.operation} data-tars-schedule-request={record.requestId} data-tars-record-source={record.source}
    aria-live={record.status === "pending" ? "polite" : undefined}
    values={<>
      {title ? <TarsRecordChip hint={title} data-tars-schedule-title="">{title}</TarsRecordChip> : null}
      {summary && record.operation !== "remove" ? <TarsRecordChip icon={CalendarClock} hint={describeTarsScheduleRule(summary.rule)} data-tars-schedule-rule="">{describeTarsScheduleRule(summary.rule)}</TarsRecordChip> : null}
    </>}
    detail={record.status === "rejected" ? <TarsRecordDetail data-tars-reason={record.reason ?? undefined}>{t(tarsScheduleReasonKey(record.reason))}</TarsRecordDetail>
      : next ? <TarsRecordDetail data-tars-schedule-next="">{t("shell:tars.schedule.card.rows.next")}: {next}</TarsRecordDetail> : null} />;
}

/**
 * One run a schedule started, as a record row whose actor is the schedule:
 * nobody typed it and Tars did not decide it. It names the schedule and
 * follows the run (started, waiting for the user, finished, failed, skipped);
 * the task it started opens from the row.
 */
export function TarsScheduleRunLine({ run, onOpenTask }: { run: TarsScheduleRun; onOpenTask?: (run: TarsScheduleRun) => void }) {
  const { t } = useTranslation(["shell"]);
  const diagnostic = (run.status === "failed" || run.status === "skipped") && run.error ? run.error : null;
  return <TarsRecordRow state={RUN_STATE[run.status]} actor={{ by: "schedule", hint: t("shell:tars.record.by.schedule") }} lead={t(`shell:tars.schedule.run.${run.status}`)} at={run.startedAt}
    data-tars-schedule-run={run.status} data-tars-schedule-run-id={run.runId} data-tars-record-actor-kind="schedule"
    aria-live={run.status === "running" || run.status === "waiting" ? "polite" : undefined}
    values={<TarsRecordChip icon={CalendarClock} hint={run.title} data-tars-schedule-title="">{run.title}</TarsRecordChip>}
    actions={run.taskId && onOpenTask ? <Button type="button" size="2xs" variant="ghost" data-tars-schedule-open-task={run.taskId} onClick={() => onOpenTask(run)}>
      {t("shell:tars.schedule.run.openTask")}</Button> : null}
    detail={diagnostic ? <TarsRecordDetail><TarsRecordDiagnostic title={diagnostic}>{diagnostic.split("\n")[0]!.slice(0, 200)}</TarsRecordDiagnostic></TarsRecordDetail> : null} />;
}

/**
 * The facts a card states. What runs leads, as the words a run starts with;
 * when it runs and its next runs follow in the card's one well; the name and
 * the workspace wait behind Details, as on every confirmation card.
 */
function ScheduleRows({ preview, state }: { preview: TarsSchedulePreview | null; state: TarsSchedulePreviewState }) {
  const { t } = useTranslation(["shell"]);
  if (!preview) return <p className={sx(styles.detail)} data-tars-schedule-preview={state}>
    {t(state === "loading" ? "shell:tars.schedule.card.loading" : "shell:tars.schedule.card.unavailable")}</p>;
  const { next, current, operation } = preview;
  const shown: TarsScheduleFacts | null = next ?? current;
  if (!shown) return null;
  // A change shows what it is now under each value that changes.
  const was = (key: "title" | "request" | "workspace" | "rule", value: string) => {
    if (operation !== "update" || !current || !next) return null;
    const changed = key === "workspace" ? current.workspace?.id !== next.workspace?.id
      : key === "rule" ? JSON.stringify(current.rule) !== JSON.stringify(next.rule) : current[key] !== next[key];
    return changed ? <span className={sx(styles.detail)} data-tars-schedule-was={key}> {t("shell:tars.schedule.card.rows.was")}: {value}</span> : null;
  };
  const rows = [
    { key: "when", label: t("shell:tars.schedule.card.rows.when"), value: describeTarsScheduleRule(shown.rule), was: current ? was("rule", describeTarsScheduleRule(current.rule)) : null },
    ...(operation === "pause" || operation === "remove" ? [] : [{ key: "next", was: null, label: t("shell:tars.schedule.card.rows.next"),
      value: describeTarsScheduleNextRuns(preview.nextRuns, preview.timezone) }]),
  ];
  const folded = [
    { key: "name", label: t("shell:tars.schedule.card.rows.name"), value: <>{shown.title}{was("title", current?.title ?? "")}</> },
    { key: "where", label: t("shell:tars.schedule.card.rows.where"),
      value: <>{describeTarsScheduleWorkspace(shown.workspace)}{was("workspace", describeTarsScheduleWorkspace(current?.workspace ?? null))}</> },
  ];
  return <>
    <dl className={sx(styles.payload)} data-tars-schedule-row="what">
      <dt className={sx(styles.payloadLabel)}>{t("shell:tars.schedule.card.rows.what")}</dt>
      <dd className={sx(styles.payloadText)}>{shown.request}{was("request", current?.request ?? "")}</dd>
    </dl>
    <dl className={sx(agentSurface.well, styles.rows)} aria-label={t("shell:tars.schedule.card.details")} data-tars-schedule-preview="ready">
      {rows.map((row) => <div key={row.key} className={sx(styles.row)} data-tars-schedule-row={row.key}>
        <dt className={sx(styles.rowLabel)}>{row.label}</dt>
        <dd className={sx(styles.rowValue)}>{row.value}{row.was}</dd>
      </div>)}
    </dl>
    <TarsCardDetails rows={folded} kind="schedule" />
  </>;
}

/**
 * Tars's proposal to create, change, pause, turn on or remove a schedule,
 * waiting for the user. Like every confirmation card it leads with what will
 * happen (the title, the schedule's name, the effect), then what runs and
 * when next, in local time with the zone, with the workspace behind Details;
 * nothing exists or changes until a button is pressed. Its main action is the
 * primary button, named by what it does. A new schedule is saved paused
 * (Create, Enter) unless the user chooses Create and turn on. Removing cannot
 * be undone, so its button wears the danger tone and has no Enter. Not now
 * (Esc) leaves everything as it is.
 */
export function TarsScheduleCard({ view, preview, previewState, busy = false, error, onConfirm, onDecline, onRetry }: {
  view: TarsScheduleProposalView;
  preview: TarsSchedulePreview | null;
  previewState: TarsSchedulePreviewState;
  busy?: boolean;
  error?: string | null;
  onConfirm: (source: TarsScheduleSource, enable?: boolean) => void;
  onDecline: () => void;
  /** Reads the card's facts again after a failed read. */
  onRetry?: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  const hintId = useId();
  const operation = view.action.operation as TarsSchedulePreview["operation"];
  const remove = operation === "remove";
  const blocked = !preview || preview.reason !== null;
  const submit = (source: TarsScheduleSource, enable?: boolean) => { if (!busy && !blocked) onConfirm(source, enable); };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = tarsPublishCardKey(event);
    if (!action) return;
    // Keeps the view's own Esc (closing the side view) from acting on the same press.
    event.preventDefault();
    event.stopPropagation();
    if (action === "decline") onDecline();
    // Enter takes the safe default: a new schedule is saved paused. Removing has no shortcut.
    else if (!remove) submit("key");
  };
  const name = (preview?.next ?? preview?.current)?.title ?? view.action.title;
  const hint = t(remove ? "shell:tars.schedule.card.keysHintRemove" : operation === "create" ? "shell:tars.schedule.card.keysHintCreate" : "shell:tars.schedule.card.keysHint");
  return <section role="group" tabIndex={-1} aria-labelledby={titleId} aria-describedby={hintId} aria-busy={busy || undefined}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-schedule-card={view.requestId} data-tars-schedule-operation={operation}>
    <div className={sx(styles.confirmHeader)}>
      <IconTile size="sm" tone={remove ? "danger" : "warning"} xstyle={styles.icon}><CalendarClock aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
      <div className={sx(styles.heading)}>
        <p id={titleId} className={sx(styles.title)}>{t(`shell:tars.schedule.card.title.${operation}`)}</p>
        {/* The schedule, as the chip the record rail names it with. */}
        {name ? <div className={sx(styles.subtitle)}><TarsRecordChip icon={CalendarClock} hint={name} data-tars-schedule-title="">{name}</TarsRecordChip></div> : null}
      </div>
      {/* The buttons say the card waits; a tag says only what they do not: that removing can't be undone. */}
      {remove ? <div className={sx(styles.tags)}><Badge size="md" tone="danger" variant="outlined" data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge></div> : null}
    </div>
    <p className={sx(styles.effect)} data-tars-schedule-effect="">{t(`shell:tars.schedule.card.subtitle.${operation}`)}</p>
    <ScheduleRows preview={preview} state={previewState} />
    {operation === "create" && preview ? <p className={sx(styles.detail)} data-tars-schedule-paused-note="">{t("shell:tars.schedule.card.startsPaused")}</p> : null}
    {operation === "update" && preview?.current && !preview.enabledAfter ? <p className={sx(styles.detail)} data-tars-schedule-paused-note="">{t("shell:tars.schedule.card.pausedNote")}</p> : null}
    {(operation === "create" || operation === "update" || operation === "resume") && preview ? <p className={sx(styles.detail)}>{t("shell:tars.schedule.card.runNote")}</p> : null}
    {preview?.reason ? <p className={sx(styles.error)} role="alert" data-tars-reason={preview.reason}>{t(tarsScheduleReasonKey(preview.reason))}</p> : null}
    <div className={sx(styles.footer)}>
      <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
      <div className={sx(styles.footerActions)}>
        <Button type="button" size="2xs" variant="ghost" aria-keyshortcuts="Escape" disabled={busy} data-tars-schedule-decline="" onClick={onDecline}>
          {t("shell:tars.schedule.card.decline")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.escKey")}</Kbd></span>
        </Button>
        {!preview && previewState === "failed" && onRetry ? <Button type="button" size="xs" variant="outline" data-tars-schedule-retry="" onClick={onRetry}>{t("shell:tars.schedule.card.retry")}</Button> : null}
        {operation === "create" && preview?.canEnableOnCreate ? <Button type="button" size="xs" variant="outline" disabled={busy || blocked} data-tars-schedule-confirm="enabled"
          onClick={() => submit("click", true)}>{t("shell:tars.schedule.card.confirm.createEnabled")}</Button> : null}
        {/* The card's main action, so the primary button; removing can't be undone, so it wears the danger tone and takes no Enter. */}
        <AuiButton type="button" size="xs" variant="primary" tone={remove ? "danger" : "neutral"} aria-keyshortcuts={remove ? undefined : "Enter"} disabled={busy || blocked}
          data-tars-schedule-confirm={operation === "create" ? "paused" : operation} data-tars-decision-tone={remove ? "danger" : "neutral"} onClick={() => submit("click")}>
          {t(`shell:tars.schedule.card.confirm.${operation}`)}
          {remove ? null : <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.enterKey")}</Kbd></span>}
        </AuiButton>
      </div>
    </div>
    {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
  </section>;
}

/** A schedule proposal in place of its receipt: the card while it waits, its record once confirmed, one line once declined. */
export function TarsScheduleProposal({ view, schedule }: { view: TarsScheduleProposalView; schedule: TarsScheduleContext }) {
  const { t } = useTranslation(["shell"]);
  if (view.record) return <TarsRecordList><TarsScheduleRecordLine record={view.record} fallbackTitle={view.action.title} /></TarsRecordList>;
  if (schedule.declined.has(view.requestId)) return <TarsRecordList><TarsRecordRow state="stopped" icon={CalendarClock} lead={t(`shell:tars.schedule.operation.${view.action.operation}`)}
    subject={t("shell:tars.schedule.card.declined")} data-tars-schedule-proposal="declined" /></TarsRecordList>;
  const { preview, state } = schedule.previewOf(view.requestId);
  return <TarsScheduleCard view={view} preview={preview} previewState={state} busy={schedule.busyId === view.requestId} error={schedule.errors.get(view.requestId)}
    onDecline={() => schedule.onDecline(view.requestId)} onConfirm={(source, enable) => schedule.onConfirm(view.requestId, source, enable)}
    onRetry={() => schedule.retryPreview(view.requestId)} />;
}
