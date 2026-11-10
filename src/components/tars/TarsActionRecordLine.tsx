import { useTranslation } from "@/i18n";
import type { TarsActionRecord, TarsMessageDelivery } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { TarsRecordDetail, TarsRecordRow, TarsRecordSub, type TarsRecordState } from "./TarsRecord";

/**
 * A record's status as its row reads it. A message kept for a busy task is
 * applied when admitted, but reads as pending until it is said in the task,
 * and as not applied when it never was.
 */
function lineStatus(record: TarsActionRecord): TarsActionRecord["status"] {
  const delivery = record.delivery?.status;
  if (!delivery || delivery === "delivered") return record.status;
  return delivery === "queued" || delivery === "delivering" ? "pending" : "rejected";
}

/** Applied, pending and refused records in the record states. */
export const TARS_RECORD_STATE: Record<TarsActionRecord["status"], TarsRecordState> = { applied: "applied", pending: "pending", rejected: "refused" };

const DELIVERY_STATE: Record<TarsMessageDelivery["status"], TarsRecordState> = {
  queued: "pending", delivering: "running", delivered: "applied", failed: "refused", cancelled: "stopped",
};

/**
 * Where words sent to a busy task stand: waiting for its turn to end, being
 * said, said, or not said and why. A follow-on line under the record or the
 * decision that sent them, with its own mark.
 */
export function TarsMessageDeliveryLine({ delivery }: { delivery: TarsMessageDelivery }) {
  const { t } = useTranslation(["shell"]);
  const notSent = delivery.status === "failed" || delivery.status === "cancelled";
  return <TarsRecordSub state={DELIVERY_STATE[delivery.status]} data-tars-delivery={delivery.status} role="status">
    <span>{t(`shell:tars.delivery.${delivery.status}`)}</span>
    {notSent ? <span data-tars-reason={delivery.reason ?? undefined}>{t(tarsControlReasonKey(delivery.reason))}</span> : null}
  </TarsRecordSub>;
}

/**
 * A click, key, drag or other direct control: one record row, never a user
 * message. What was done (the control or the queue move) and to which work,
 * where it came from and how it came out; a refusal says why on its own line.
 */
export function TarsActionRecordLine({ record, title }: { record: TarsActionRecord; title?: string }) {
  const { t } = useTranslation(["shell"]);
  const { action, source } = record;
  const status = lineStatus(record);
  const lead = action.kind === "move"
    ? t(`shell:tars.record.move.${source === "drag" ? "drag" : "click"}.${action.move.direction}`)
    : t(`shell:tars.record.operation.${action.operation}`);
  const meta = [t(`shell:tars.record.source.${source}`), record.priority !== undefined ? t("shell:tars.record.priority", { priority: record.priority }) : null]
    .filter(Boolean).join(" · ");
  return <TarsRecordRow state={TARS_RECORD_STATE[status]} lead={lead} subject={title} meta={meta} status={t(`shell:tars.record.status.${status}`)} at={record.createdAt}
    data-tars-action-record={record.status} data-tars-record-kind={action.kind} data-tars-record-priority={record.priority}
    detail={<>
      {record.status === "rejected" ? <TarsRecordDetail data-tars-reason={record.reason}>{t(tarsControlReasonKey(record.reason))}</TarsRecordDetail> : null}
      {record.delivery ? <TarsMessageDeliveryLine delivery={record.delivery} /> : null}
    </>} />;
}
