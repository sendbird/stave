import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { tarsStyles as styles } from "./tars.styles";

/** What a record line says: the control and where it came from, or the queue move and how it was asked. */
function recordKey(record: TarsActionRecord) {
  const { action, source, status } = record;
  if (action.kind === "move") return `shell:tars.conversation.records.move.${source === "drag" ? "drag" : "click"}.${status}.${action.move.direction}` as const;
  return `shell:tars.conversation.records.${source === "drag" ? "click" : source}.${status}.${action.operation}` as const;
}

/** A click, key, drag or other direct control: one line in the timeline, never a user message. */
export function TarsActionRecordLine({ record, title }: { record: TarsActionRecord; title?: string }) {
  const { t } = useTranslation(["shell"]);
  return <p className={sx(styles.actionRecord)} data-tars-action-record={record.status} data-tars-record-kind={record.action.kind}>
    <span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
    <span>{t(recordKey(record))}</span>
    {title ? <span className={sx(styles.recordTitle)}>{title}</span> : null}
    {record.priority !== undefined ? <span className={sx(styles.recordTitle)} data-tars-record-priority={record.priority}>
      {t("shell:tars.conversation.records.movePriority", { priority: record.priority })}</span> : null}
    {record.status === "rejected" ? <span className={sx(styles.error)} data-tars-reason={record.reason}>{t(tarsControlReasonKey(record.reason))}</span> : null}
  </p>;
}
