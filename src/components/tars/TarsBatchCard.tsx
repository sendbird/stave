import { tarsBatchOutcomeCounts } from "@/lib/tars/batch-outcome";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { formatResourceBytes } from "@/lib/performance/resource-manager";
import { tarsBatchStyles as batchStyles } from "./tars-batch.styles";
import { useEffect, useId, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { Button as LaneButton } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { TarsRecordRow, TarsRecordList } from "./TarsRecord";
import type { TarsBatchAction, TarsBatchRecord } from "@/lib/tars/batch";
import type { TarsActionReceipt } from "@/lib/tars/conversation";

/** One shared line explains it; items skipped only for this reason show no reason of their own. */
const PR_STATUS_UNAVAILABLE = "prStatusUnavailable";

/**
 * A batch in each of its states. Only a proposal shows Confirm and Decline;
 * an executing batch shows its progress without buttons, and an interrupted
 * one offers Continue (`onConfirm`) for its frozen remaining items.
 */
export function TarsBatchCard({ record, busy, error, onConfirm, onRestore, onDecline }: {
  record: TarsBatchRecord; busy: boolean; error?: string; onConfirm: () => void; onRestore: () => void; onDecline: () => void;
}) {
  const { t } = useTranslation(["shell", "workspace"]);
  const titleId = useId();
  const verb = record.action.kind === "bulkControl" ? record.action.operation : record.action.permanentlyDeleteArchived ? "delete" : "archive";
  const danger = verb === "cancel" || verb === "delete" || record.action.kind === "cleanup" && record.action.deleteBranches;
  const included = record.items.filter(item => item.status === "included").length;
  const skipped = record.items.filter(item => item.status === "skipped").length;
  const counts = tarsBatchOutcomeCounts(record);
  const parts: Array<{ key: "applied" | "archived" | "deleted" | "restored" | "undone" | "skipped" | "uncertain"; count: number }> = [
    ...(record.action.kind === "cleanup" ? [{ key: "archived" as const, count: counts.archived }, { key: "deleted" as const, count: counts.deleted }]
      : [{ key: "applied" as const, count: counts.applied }]),
    { key: record.action.kind === "cleanup" ? "restored" : "undone", count: counts.restored },
    { key: "skipped", count: counts.skipped }, { key: "uncertain", count: counts.uncertain },
  ];
  const summary = formatList(parts.filter(part => part.count > 0).map(part => t(`shell:tars.batch.outcome.${part.key}`, { count: part.count }))) || t("shell:tars.batch.nothingChanged");
  const reasonText = (reason: string) => {
    const controlKey = record.action.kind === "bulkControl" ? tarsControlReasonKey(reason) : null;
    return controlKey ? t(controlKey) : t(`workspace:cleanupCenter.reasons.${reason}`, { defaultValue: t(`shell:tars.batch.reasons.${reason}`, { defaultValue: t("shell:tars.batch.changed") }) });
  };
  const reasonsOf = (item: TarsBatchRecord["items"][number]) => (item.reason?.split(",") ?? []).filter(reason => reason !== PR_STATUS_UNAVAILABLE);
  const prUnavailable = record.items.some(item => item.status === "skipped" && item.reason?.split(",").includes(PR_STATUS_UNAVAILABLE));
  const skippedReasons = [...new Set(record.items.filter(item => item.status === "skipped").flatMap(reasonsOf))].map(reasonText).join(", ");
  const statusText = (item: TarsBatchRecord["items"][number]) => {
    const reasons = reasonsOf(item);
    if (reasons.length) return t(item.status === "applied" ? "shell:tars.batch.partialReason" : "shell:tars.batch.skippedReason", { reason: reasons.map(reasonText).join(", ") });
    if (item.status === "included" && record.action.kind === "cleanup") return t("shell:tars.batch.eligibleEnded");
    if (item.status === "restored" && item.readOnly) return t("shell:tars.batch.status.restoredReadOnly");
    return t(`shell:tars.batch.status.${item.status}`);
  };
  const notes = <>
    {record.omitted ? <p className={sx(styles.detail)} data-tars-batch-omitted="">
      {t(record.action.kind === "cleanup" ? "shell:tars.batch.omitted.unfinished" : "shell:tars.batch.omitted.ended", { count: record.omitted })}</p> : null}
    {prUnavailable ? <p className={sx(styles.detail)} data-tars-batch-pr-unavailable="">{t("shell:tars.batch.prStatusUnavailable")}</p> : null}
  </>;
  const details = <ul className={sx(batchStyles.list)}>{record.items.map(item => <li key={item.responsibilityId} className={sx(styles.payload)}>
    <span className={sx(styles.payloadText)}>{item.name}</span><span className={sx(styles.detail)}>{item.repositoryPath}</span>
    <span className={sx(styles.detail)}>{t(`shell:tars.batch.verb.${item.action}`)} · {statusText(item)}{item.bytes !== null ? ` · ${formatResourceBytes(item.bytes)}` : ""}</span>
  </li>)}</ul>;
  const alert = error ? <p role="alert" className={sx(styles.error)}>{error}</p> : null;
  if (record.state === "declined") return <TarsRecordList><TarsRecordRow state="stopped" icon={Archive} data-tars-batch-record={record.id}
    lead={t(`shell:tars.batch.verb.${verb}`)} subject={t("shell:tars.batch.declined")} /></TarsRecordList>;
  if (record.state === "executing") return <TarsRecordList><TarsRecordRow state="running" icon={Archive} data-tars-batch-record={record.id} aria-busy={true}
    lead={t(`shell:tars.batch.verb.${verb}`)} subject={t("shell:tars.batch.executing", { count: record.items.filter(item => item.status === "included" || item.status === "applying").length })}
    detail={<>{notes}{details}{alert}</>} /></TarsRecordList>;
  if (record.state === "interrupted") return <TarsRecordList><TarsRecordRow state="halted" icon={Archive} data-tars-batch-record={record.id}
    lead={t("shell:tars.batch.interruptedLead")} subject={t("shell:tars.batch.interrupted", { summary, count: included })}
    detail={<>{notes}{details}{alert}</>}
    actions={included ? <Button size="xs" variant="quiet" disabled={busy} onClick={onConfirm} data-tars-batch-continue="">{t("shell:tars.batch.continue")}</Button> : null} /></TarsRecordList>;
  if (record.state === "applied" || record.state === "restored") return <TarsRecordList><TarsRecordRow icon={Archive} state={counts.uncertain ? "skipped" : "applied"} data-tars-batch-record={record.id}
    lead={t(record.action.kind === "cleanup" ? "shell:tars.batch.cleanupResultLead" : record.state === "restored" ? "shell:tars.clear.record.undone" : `shell:tars.batch.resultVerb.${verb}`)} subject={skippedReasons ? t("shell:tars.batch.outcomeWithReasons", { summary, reasons: skippedReasons }) : summary}
    detail={<>{notes}{details}{alert}</>}
    actions={record.items.some(item => (item.action === "archive" || item.undoable) && item.status === "applied") ? <Button size="xs" variant="quiet" disabled={busy} onClick={onRestore} data-tars-batch-restore="">{t(record.action.kind === "cleanup" ? "shell:tars.clear.restore" : "shell:tars.clear.undo")}</Button> : null} /></TarsRecordList>;
  return <section className={sx(styles.card)} role="region" aria-labelledby={titleId} tabIndex={0} data-tars-batch-card={record.id} aria-busy={busy} onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" && !danger && !busy && included) { event.preventDefault(); onConfirm(); }
    if (event.key === "Escape" && !busy) onDecline();
  }}>
    <p id={titleId} className={sx(styles.title)}>{t(`shell:tars.batch.verb.${verb}`)} · {t("shell:tars.batch.count", { count: included, skipped })}</p>
    <p className={sx(styles.effect)}>{t("shell:tars.batch.effect")}</p>
    {notes}
    {details}
    {/* Nothing can be applied: the card says why and closes, instead of leaving a dead positive button. */}
    {included ? <p className={sx(styles.detail)}>{t(danger ? "shell:tars.batch.irreversible" : "shell:tars.batch.reversible")}</p>
      : <p className={sx(styles.detail)} data-tars-batch-nothing="">{t(record.action.kind === "cleanup" ? "shell:tars.batch.nothingIncluded.cleanup" : "shell:tars.batch.nothingIncluded.control")}</p>}
    <div className={sx(styles.footerActions)}>
      {included ? <>
        <Button size="xs" variant="quiet" onClick={onDecline} disabled={busy} data-tars-batch-decline="">{t("shell:tars.clear.card.decline")}</Button>
        <Button size="xs" variant="primary" tone={danger ? "danger" : "neutral"} onClick={onConfirm} disabled={busy} data-tars-batch-confirm="">{t(`shell:tars.batch.verb.${verb}`)}</Button>
      </> : <Button size="xs" variant="primary" tone="neutral" onClick={onDecline} disabled={busy} data-tars-batch-close="">{t("shell:tars.batch.close")}</Button>}
    </div>
    {alert}
  </section>;
}

/** Runs one batch operation through the host and keeps the card's own busy and error state. */
function useBatchOperation(initial: TarsBatchRecord | null) {
  const { t } = useTranslation(["shell"]);
  const bridge = typeof window === "undefined" ? undefined : window.api?.tars;
  const [record, setRecord] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function invoke(operation: "confirm" | "restore" | "decline"): Promise<TarsBatchRecord | null> {
    if (!record || !bridge?.batch || busy) return null;
    setBusy(true);
    try { const result = await bridge.batch({ operation, id: record.id }); setRecord(result); setError(undefined); return result; }
    catch { setError(t("shell:tars.batch.failed")); return null; }
    finally { setBusy(false); }
  }
  return { bridge, record, setRecord, busy, error, setError, invoke };
}

/**
 * One batch the planner proposed (`receipt`) or the Done lane opened. A
 * declined tray preview closes (`onClose`); a declined proposal stays as one line.
 */
export function TarsBatchProposal({ action, receipt, onSettled, onClose }: { action: TarsBatchAction; receipt?: TarsActionReceipt; onSettled?: () => void; onClose?: () => void }) {
  const { t } = useTranslation(["shell", "workspace"]);
  const { bridge, record, setRecord, busy, error, setError, invoke } = useBatchOperation(null);
  useEffect(() => {
    let alive = true;
    if (bridge?.batch) void bridge.batch({ operation: "preview", action, ...(receipt ? { proposal: { messageId: receipt.messageId, actionIndex: receipt.actionIndex } } : {}) })
      .then(value => { if (alive) setRecord(value); }).catch(() => { if (alive) setError(t("shell:tars.batch.failed")); });
    return () => { alive = false; };
  }, [action, bridge, receipt, setError, setRecord, t]);
  if (!record) return <p role="status">{error ?? t("shell:tars.batch.loading")}</p>;
  return <TarsBatchCard record={record} busy={busy} error={error}
    onConfirm={() => void invoke("confirm").then(result => { if (result?.state === "applied") onSettled?.(); })}
    onRestore={() => void invoke("restore")}
    onDecline={() => void invoke("decline").then(result => { if (result && !result.proposal) onClose?.(); })} />;
}

const FINISHED: TarsBatchAction = { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false };
/** The Done lane's one cleanup entry: a direct button, not a one-item menu. */
export function TarsCleanupEntry() {
  const { t } = useTranslation(["shell", "workspace"]);
  const [open, setOpen] = useState(false);
  if (typeof window === "undefined" || !window.api?.tars?.batch) return null;
  const close = () => setOpen(false);
  return <div data-tars-cleanup-entry="">
    {/* The same button as the lane's Clear and Undo beside it. */}
    <LaneButton variant="ghost" size="xs" disabled={open} onClick={() => setOpen(true)} data-tars-cleanup-open="">{t("shell:tars.batch.entry")}</LaneButton>
    {open ? <TarsBatchProposal action={FINISHED} onSettled={close} onClose={close} /> : null}
  </div>;
}

/**
 * Batches confirmed outside the conversation (the Done lane), read from the
 * host and refreshed on change. The conversation places each at its own time.
 */
export function useTarsBatchRecords() {
  const bridge = typeof window === "undefined" ? undefined : window.api?.tars;
  const [records, setRecords] = useState<TarsBatchRecord[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = () => { void bridge?.batches?.().then(value => { if (alive) { setRecords(value); setError(false); } }).catch(() => { if (alive) setError(true); }); };
    read();
    const stop = bridge?.onChanged?.(read);
    return () => { alive = false; stop?.(); };
  }, [bridge]);
  const shown = useMemo(() => records.filter(record => !record.proposal && record.state !== "proposed" && record.state !== "declined"), [records]);
  return { records: shown, error };
}

/** A tray batch's record at its place in the conversation, with its own Restore or Continue. */
export function TarsBatchRecordEntry({ record: saved }: { record: TarsBatchRecord }) {
  const { record, setRecord, busy, error, invoke } = useBatchOperation(saved);
  useEffect(() => { setRecord(saved); }, [saved, setRecord]);
  if (!record) return null;
  return <TarsBatchCard record={record} busy={busy} error={error} onConfirm={() => void invoke("confirm")} onRestore={() => void invoke("restore")} onDecline={() => {}} />;
}
