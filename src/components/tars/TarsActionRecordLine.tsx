import { Button } from "@/components/ui";
import { useTarsActionUndo } from "./use-tars-action-undo";
import { ArrowDownUp } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { TarsActionRecord, TarsActionRecordSource, TarsMessageDelivery } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { TarsRecordChip, TarsRecordDetail, TarsRecordRow, TarsRecordSub, TarsWorkChip, type TarsRecordActor, type TarsRecordState } from "./TarsRecord";

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
 * The user did it directly: in Tars by pointer or key, by a short answer in
 * the conversation, from Fleet, from the task view, or by a drag in the queue.
 * The record shows a person glyph; the sentence says where.
 */
export function useTarsDirectActor(): (source: TarsActionRecordSource) => TarsRecordActor {
  const { t } = useTranslation(["shell"]);
  return (source) => ({ by: "you", hint: t(`shell:tars.record.by.you.${source}`) });
}

/**
 * A click, key, drag or other direct control: one record row, never a user
 * message. Who did it (you, and where on hover), what was done (the control
 * or the queue move), the work as a chip and its new priority, and how it
 * came out; a refusal says why on its own line.
 */
export function TarsActionRecordLine({ record, title }: { record: TarsActionRecord; title?: string }) {
  const { t } = useTranslation(["shell"]);
  const actorOf = useTarsDirectActor();
  const undo = useTarsActionUndo(record);
  const { action, source } = record;
  const status = lineStatus(record);
  const lead = action.kind === "move"
    ? t(`shell:tars.record.move.${source === "drag" ? "drag" : "click"}.${action.move.direction}`)
    : t(`shell:tars.record.operation.${action.operation}`);
  const values = <>
    {title ? <TarsWorkChip title={title} responsibilityId={action.responsibilityId} /> : null}
    {record.priority !== undefined ? <TarsRecordChip icon={ArrowDownUp} data-tars-record-priority-value="">{t("shell:tars.record.priority", { priority: record.priority })}</TarsRecordChip> : null}
  </>;
  return <TarsRecordRow state={TARS_RECORD_STATE[status]} actor={actorOf(source)} lead={lead} values={values} status={undo.undone ? t("shell:tars.record.undo.done") : t(`shell:tars.record.status.${status}`)} at={record.createdAt}
    data-tars-action-record={record.status} data-tars-record-kind={action.kind} data-tars-record-priority={record.priority} data-tars-record-source={source}
    actions={undo.available ? <Button type="button" variant="ghost" size="2xs" disabled={undo.pending} onClick={() => void undo.undo()}
      data-tars-record-undo="">{t(undo.pending ? "shell:tars.record.undo.pending" : "shell:tars.record.undo.action")}</Button> : null}
    detail={<>
      {record.status === "rejected" ? <TarsRecordDetail data-tars-reason={record.reason}>{t(tarsControlReasonKey(record.reason))}</TarsRecordDetail> : null}
      {undo.refusal ? <TarsRecordDetail role="status">{t(`shell:tars.record.undo.${undo.refusal}`)}</TarsRecordDetail> : null}
      {record.delivery ? <TarsMessageDeliveryLine delivery={record.delivery} /> : null}
    </>} />;
}
