import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { tarsStyles as styles } from "./tars.styles";

/** A click or key control: one line in the timeline, never a user message. */
export function TarsActionRecordLine({ record, title }: { record: TarsActionRecord; title?: string }) {
  const { t } = useTranslation(["shell"]);
  return <p className={sx(styles.actionRecord)} data-tars-action-record={record.status}>
    <span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
    <span>{t(`shell:tars.conversation.records.${record.source}.${record.status}.${record.action.operation}`)}</span>
    {title ? <span className={sx(styles.recordTitle)}>{title}</span> : null}
    {record.status === "rejected" ? <span className={sx(styles.error)} data-tars-reason={record.reason}>{t(tarsControlReasonKey(record.reason))}</span> : null}
  </p>;
}
