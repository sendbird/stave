import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsActionRecord, TarsMessageDelivery } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { tarsStyles as styles } from "./tars.styles";

/**
 * A record's status as its line reads it. A message kept for a busy task is
 * applied when admitted, but reads as pending until it is said in the task,
 * and as not applied when it never was.
 */
function lineStatus(record: TarsActionRecord): TarsActionRecord["status"] {
  const delivery = record.delivery?.status;
  if (!delivery || delivery === "delivered") return record.status;
  return delivery === "queued" || delivery === "delivering" ? "pending" : "rejected";
}

/** What a record line says: the control and where it came from, or the queue move and how it was asked. */
function recordKey(record: TarsActionRecord) {
  const { action, source } = record;
  const status = lineStatus(record);
  if (action.kind === "move") return `shell:tars.conversation.records.move.${source === "drag" ? "drag" : "click"}.${status}.${action.move.direction}` as const;
  return `shell:tars.conversation.records.${source === "drag" ? "click" : source}.${status}.${action.operation}` as const;
}

/**
 * Where words sent to a busy task stand: waiting for its turn to end, being
 * said, said, or not said and why. Shown under the record or decision that sent them.
 */
export function TarsMessageDeliveryLine({ delivery }: { delivery: TarsMessageDelivery }) {
  const { t } = useTranslation(["shell"]);
  const notSent = delivery.status === "failed" || delivery.status === "cancelled";
  return <p className={sx(styles.actionRecord)} data-tars-delivery={delivery.status} role="status">
    <span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
    <span>{t(`shell:tars.delivery.${delivery.status}`)}</span>
    {notSent ? <span className={sx(styles.error)} data-tars-reason={delivery.reason ?? undefined}>{t(tarsControlReasonKey(delivery.reason))}</span> : null}
  </p>;
}

/** A click, key, drag or other direct control: one line in the timeline, never a user message. */
export function TarsActionRecordLine({ record, title }: { record: TarsActionRecord; title?: string }) {
  const { t } = useTranslation(["shell"]);
  return <>
    <p className={sx(styles.actionRecord)} data-tars-action-record={record.status} data-tars-record-kind={record.action.kind}>
      <span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
      <span>{t(recordKey(record))}</span>
      {title ? <span className={sx(styles.recordTitle)}>{title}</span> : null}
      {record.priority !== undefined ? <span className={sx(styles.recordTitle)} data-tars-record-priority={record.priority}>
        {t("shell:tars.conversation.records.movePriority", { priority: record.priority })}</span> : null}
      {record.status === "rejected" ? <span className={sx(styles.error)} data-tars-reason={record.reason}>{t(tarsControlReasonKey(record.reason))}</span> : null}
    </p>
    {record.delivery ? <TarsMessageDeliveryLine delivery={record.delivery} /> : null}
  </>;
}
