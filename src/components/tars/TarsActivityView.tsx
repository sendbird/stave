import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDate, formatTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { ToggleGroup } from "@/components/aui/components/ToggleGroup";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { sx } from "@/components/aui/utils/stylex";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { groupTarsActivity, projectTarsActivity, TARS_ACTIVITY_FILTERS, type TarsActivityEntry, type TarsActivityFilter } from "@/lib/tars/activity";
import type { TarsConversation } from "@/lib/tars/conversation";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useTarsActionUndo } from "./use-tars-action-undo";
import { useTarsTextScale } from "./TarsMessageChrome";
import { describeTarsWorkspaceAction } from "./TarsWorkspaceReceipt";
import { tarsInsightsStyles as styles } from "./tars-insights.styles";
import { tarsActivityStyles as activityStyles } from "./tars-activity.styles";

function useDescription(entry: TarsActivityEntry) {
  const { t } = useTranslation(["shell"]);
  const content = entry.content;
  if (content.kind === "decision") return t("shell:tars.activityView.decision", {
    state: t(`shell:tars.activityView.decisions.${content.decision.state}`), question: content.decision.question ?? t("shell:tars.activityView.confirmation") });
  if (content.kind === "inspection") return t(content.reading ? "shell:tars.activityView.inspecting" : content.status && content.status !== "read" ? "shell:tars.activityView.inspectionUnavailable" : "shell:tars.activityView.inspected", { view: t(`shell:tars.activityView.views.${content.view}`) });
  if (content.kind === "publication") return t("shell:tars.activityView.publication", { status: t(`shell:tars.record.status.${content.publication.status}`) });
  if (content.kind === "observation") return content.activity.prChecks
    ? t(`shell:tars.activityView.checks.${content.activity.prChecks.state}`)
    : t(`shell:tars.states.${content.activity.state}`);
  const { action } = content;
  const label = action.kind === "workspace" ? describeTarsWorkspaceAction(action, entry.title ?? action.workspaceId, content.status === "applied")
    : action.kind === "control" ? t(`shell:tars.record.operation.${action.operation}`)
    : action.kind === "open" ? t(`shell:tars.activityView.open.${action.target}`)
    : action.kind === "show" ? t(`shell:tars.record.show.${action.view}`)
    : action.kind === "move" ? t(`shell:tars.record.move.click.${action.move.direction}`)
    : action.kind === "delegate" ? t("shell:tars.record.delegate")
    : action.kind === "reprioritize" ? t("shell:tars.record.reprioritize", { priority: action.priority })
    : action.kind === "ask" ? action.question
    : action.kind === "withdraw" ? t("shell:tars.decision.withdraw.lead")
    : action.kind === "publish" ? t("shell:tars.record.publish")
    : action.kind === "schedule" ? t(`shell:tars.schedule.operation.${action.operation}`) : t("shell:tars.record.clear");
  const status = content.status === "undone" ? t("shell:tars.record.undo.done")
    : content.status === "proposed" ? t("shell:tars.conversation.receipts.proposed")
    : t(`shell:tars.record.status.${content.status}`);
  return t("shell:tars.activityView.action", { action: label, status });
}

function Undo({ record }: { record: NonNullable<TarsActivityEntry["undo"]> }) {
  const { t } = useTranslation(["shell"]);
  const undo = useTarsActionUndo(record);
  return <>
    {undo.available ? <Button variant="ghost" size="2xs" disabled={undo.pending} onClick={() => void undo.undo()}>{t(undo.pending ? "shell:tars.record.undo.pending" : "shell:tars.record.undo.action")}</Button> : null}
    {undo.undone ? <span role="status">{t("shell:tars.record.undo.done")}</span> : null}
    {undo.refusal ? <span role="status">{t(`shell:tars.record.undo.${undo.refusal}`)}</span> : null}
  </>;
}

function ActivityRow({ entry, onOpenWork }: { entry: TarsActivityEntry; onOpenWork: (id: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const description = useDescription(entry);
  return <li className={sx(activityStyles.row)} data-tars-activity-entry={entry.id}>
    {entry.responsibilityId ? <Button variant="link" size="xs" xstyle={styles.rowOpen} onClick={() => onOpenWork(entry.responsibilityId!)}>{entry.title ?? t("shell:tars.activityView.workUnavailable")}</Button>
      : <span className={sx(styles.itemTitle)}>{entry.title ?? t("shell:tars.title")}</span>}
    <p className={sx(activityStyles.description)} title={description}>{description}</p>
    <div className={sx(styles.rowMeta)}><time dateTime={entry.at}>{formatTime(entry.at, { hour: "numeric", minute: "2-digit" })}</time>
      <span>{t(`shell:tars.activityView.origin.${entry.origin}`)}</span>
      {entry.undo ? <Undo record={entry.undo} /> : null}
    </div>
  </li>;
}

export function TarsActivityView({ conversation, responsibilities, onOpenWork, failed, onReload }: {
  conversation: TarsConversation | null; responsibilities: readonly TarsResponsibility[] | null; onOpenWork: (id: string) => void;
  failed?: boolean; onReload?: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const [filter, setFilter] = useState<TarsActivityFilter>("all");
  const entries = useMemo(() => conversation ? projectTarsActivity(conversation, responsibilities) : [], [conversation, responsibilities]);
  const groups = groupTarsActivity(entries, filter);
  return <div className={sx(styles.body, textWrap.keepAll)} data-tars-activity="">
    <div className={sx(styles.toolbar)}><ToggleGroup density="compact" aria-label={t("shell:tars.activityView.filtersLabel")} value={[filter]}
      options={TARS_ACTIVITY_FILTERS.map(value => ({ value, label: t(`shell:tars.activityView.filters.${value}`) }))}
      onValueChange={(values) => { const next = values[0] as TarsActivityFilter | undefined; if (next) setFilter(next); }} /></div>
    <p className={sx(styles.note)}>{t("shell:tars.activityView.retention")}</p>
    {failed ? <div role="alert" className={sx(styles.note, styles.error)}>{t("shell:tars.activityView.failed")}
      {onReload ? <Button variant="ghost" size="xs" onClick={onReload}>{t("shell:tars.retry")}</Button> : null}</div> : null}
    {!conversation ? <p role="status" className={sx(styles.note)}>{t(failed ? "shell:tars.activityView.failed" : "shell:tars.activityView.loading")}</p> : groups.length === 0
      ? <p className={sx(styles.note)}>{t("shell:tars.activityView.empty")}</p> : groups.map(group => <section key={group.day} className={sx(styles.section)} aria-label={formatDate(group.at)}>
        <h3 className={sx(styles.sectionTitle)}>{formatDate(group.at)}</h3>
        <ul className={sx(activityStyles.list)}>{group.entries.map(entry => <ActivityRow key={entry.id} entry={entry} onOpenWork={onOpenWork} />)}</ul>
      </section>)}
  </div>;
}

export function TarsActivityPanel({ open, onOpenChange, ...props }: Parameters<typeof TarsActivityView>[0] & {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const textScale = useTarsTextScale();
  return <>
    <Tooltip content={t("shell:tars.activityView.shortcut")}><Button variant="ghost" size="icon-sm" aria-label={t("shell:tars.activityView.title")} aria-keyshortcuts="Control+Shift+A Meta+Shift+A" aria-expanded={open} onClick={() => onOpenChange(true)} data-tars-activity-button=""><History aria-hidden /></Button></Tooltip>
    <Sheet open={open} onOpenChange={onOpenChange}><SheetContent xstyle={styles.sheet} style={textScale} data-tars-activity-sheet="">
      <SheetHeader><SheetTitle>{t("shell:tars.activityView.title")}</SheetTitle><SheetDescription>{t("shell:tars.activityView.description")}</SheetDescription></SheetHeader>
      {open ? <TarsActivityView {...props} onOpenWork={(id) => { onOpenChange(false); props.onOpenWork(id); }} /> : null}
    </SheetContent></Sheet>
  </>;
}
