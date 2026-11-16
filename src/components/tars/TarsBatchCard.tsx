import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { tarsBatchStyles as batchStyles } from "./tars-batch.styles";
import { useEffect, useState } from "react";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { Archive } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { TarsRecordRow, TarsRecordList } from "./TarsRecord";
import type { TarsBatchAction, TarsBatchRecord } from "@/lib/tars/batch";
import type { TarsActionReceipt } from "@/lib/tars/conversation";

export function TarsBatchCard({ record, busy, error, onConfirm, onRestore, onDecline }: {
  record: TarsBatchRecord; busy: boolean; error?: string; onConfirm: () => void; onRestore: () => void; onDecline: () => void;
}) {
  const { t } = useTranslation(["shell", "workspace"]);
  const verb = record.action.kind === "bulkControl" ? record.action.operation : record.action.permanentlyDeleteArchived ? "delete" : "archive";
  const danger = verb === "cancel" || verb === "delete" || record.action.kind === "cleanup" && record.action.deleteBranches;
  const settled = record.state === "applied" || record.state === "restored";
  const included = record.items.filter(item => item.status === "included").length;
  const skipped = record.items.filter(item => item.status === "skipped").length;
  const applied = record.items.filter(item => item.status === "applied" || item.status === "restored").length;
  const reasonText = (reason: string) => {
    const controlKey = record.action.kind === "bulkControl" ? tarsControlReasonKey(reason) : null;
    return controlKey ? t(controlKey) : t(`workspace:cleanupCenter.reasons.${reason}`, { defaultValue: t(`shell:tars.batch.reasons.${reason}`, { defaultValue: t("shell:tars.batch.changed") }) });
  };
  const skippedReasons = [...new Set(record.items.filter(item => item.status === "skipped").flatMap(item => item.reason?.split(",") ?? []))].map(reasonText).join(", ");
  const details = <ul className={sx(batchStyles.list)}>{record.items.map(item => <li key={item.responsibilityId} className={sx(styles.payload)}>
    <span className={sx(styles.payloadText)}>{item.name}</span><span className={sx(styles.detail)}>{item.repositoryPath}</span>
    <span className={sx(styles.detail)}>{t(`shell:tars.batch.verb.${item.action}`)} · {item.reason ? t(item.status === "applied" ? "shell:tars.batch.partialReason" : "shell:tars.batch.skippedReason", { reason: item.reason.split(",").map(reasonText).join(", ") }) : item.status === "included" && record.action.kind === "cleanup" ? t("shell:tars.batch.eligibleEnded") : t(`shell:tars.batch.status.${item.status}`)}{item.bytes !== null ? ` · ${formatNumber(item.bytes)} B` : ""}</span>
  </li>)}</ul>;
  if (settled) return <TarsRecordList><TarsRecordRow icon={Archive} state="applied" data-tars-batch-record={record.id}
    lead={t(record.state === "restored" ? "shell:tars.clear.record.undone" : `shell:tars.batch.resultVerb.${verb}`)} subject={t(skippedReasons ? "shell:tars.batch.resultWithReasons" : "shell:tars.batch.result", { count: applied, skipped, reasons: skippedReasons })}
    detail={<>{details}{error ? <p role="alert">{error}</p> : null}</>}
    actions={record.items.some(item => (item.action === "archive" || item.undoable) && item.status === "applied") ? <Button size="xs" variant="quiet" disabled={busy} onClick={onRestore} data-tars-batch-restore="">{t(record.action.kind === "cleanup" ? "shell:tars.clear.restore" : "shell:tars.clear.undo")}</Button> : null} /></TarsRecordList>;
  return <section className={sx(styles.card)} tabIndex={0} data-tars-batch-card={record.id} aria-busy={busy} onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" && !danger && !busy && included) { event.preventDefault(); onConfirm(); }
    if (event.key === "Escape" && !busy) onDecline();
  }}>
    <p className={sx(styles.title)}>{t(`shell:tars.batch.verb.${verb}`)} · {t("shell:tars.batch.count", { count: included, skipped })}</p>
    <p className={sx(styles.effect)}>{t("shell:tars.batch.effect")}</p>
    {details}
    <p className={sx(styles.detail)}>{t(danger ? "shell:tars.batch.irreversible" : "shell:tars.batch.reversible")}</p>
    <div className={sx(styles.footerActions)}>
      <Button size="xs" variant="quiet" onClick={onDecline} disabled={busy}>{t("shell:tars.clear.card.decline")}</Button>
      <Button size="xs" variant="primary" tone={danger ? "danger" : "neutral"} onClick={onConfirm} disabled={busy || !included} data-tars-batch-confirm="">{t(`shell:tars.batch.verb.${verb}`)}</Button>
    </div>
    {error ? <p role="alert" className={sx(styles.error)}>{error}</p> : null}
  </section>;
}

export function TarsBatchProposal({ action, receipt, onSettled }: { action: TarsBatchAction; receipt?: TarsActionReceipt; onSettled?: () => void }) {
  const { t } = useTranslation(["shell", "workspace"]);
  const bridge = typeof window === "undefined" ? undefined : window.api?.tars;
  const [record, setRecord] = useState<TarsBatchRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    let alive = true;
    if (bridge?.batch) void bridge.batch({ operation: "preview", action, ...(receipt ? { proposal: { messageId: receipt.messageId, actionIndex: receipt.actionIndex } } : {}) })
      .then(value => { if (alive) setRecord(value); }).catch(() => { if (alive) setError(t("shell:tars.batch.failed")); });
    return () => { alive = false; };
  }, [action, bridge, receipt, t]);
  async function invoke(operation: "confirm" | "restore") {
    if (!record || !bridge?.batch || busy) return;
    setBusy(true);
    try { const result = await bridge.batch({ operation, id: record.id }); setRecord(result); setError(undefined); if (operation === "confirm" && result.state === "applied") onSettled?.(); }
    catch { setError(t("shell:tars.batch.failed")); }
    finally { setBusy(false); }
  }
  if (declined) return null;
  if (!record) return <p role="status">{error ?? t("shell:tars.batch.loading")}</p>;
  return <TarsBatchCard record={record} busy={busy} error={error} onConfirm={() => void invoke("confirm")} onRestore={() => void invoke("restore")} onDecline={() => setDeclined(true)} />;
}

const FINISHED: TarsBatchAction = { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false };
export function TarsCleanupEntry() {
  const { t } = useTranslation(["shell", "workspace"]);
  const [open, setOpen] = useState(false);
  if (typeof window === "undefined" || !window.api?.tars?.batch) return null;
  return <div data-tars-cleanup-entry=""><DropdownMenu trigger={t("shell:tars.batch.entry")} triggerProps={{ "aria-label": t("shell:tars.batch.entry") }} groups={[{ items: [{ label: t("shell:tars.batch.entry"), onSelect: () => setOpen(true) }] }]} />
    {open ? <TarsBatchProposal action={FINISHED} onSettled={() => setOpen(false)} /> : null}</div>;
}


/** Direct tray cleanups remain discoverable after the tray closes or the window reconnects. */
export function TarsBatchHistory() {
  const { t } = useTranslation(["shell"]);
  const [error, setError] = useState(false);
  const bridge = typeof window === "undefined" ? undefined : window.api?.tars;
  const [records, setRecords] = useState<TarsBatchRecord[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = () => { void bridge?.batches?.().then(value => { if (alive) setRecords(value.filter(record => !record.proposal && record.state !== "proposed")); }).catch(() => { if (alive) setError(true); }); };
    read();
    const stop = bridge?.onChanged?.(read);
    return () => { alive = false; stop?.(); };
  }, [bridge]);
  return <>{error ? <p role="alert">{t("shell:tars.batch.failed")}</p> : null}{records.map(record => <TarsBatchCard key={record.id} record={record} busy={busy} onConfirm={() => {}} onDecline={() => {}}
    onRestore={() => { if (busy || !bridge?.batch) return; setBusy(true); void bridge.batch({ operation: "restore", id: record.id }).then(value => setRecords(current => current.map(row => row.id === value.id ? value : row))).catch(() => setError(true)).finally(() => setBusy(false)); }} />)}</>;
}
