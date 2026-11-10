import { useTranslation } from "@/i18n";
import { i18n } from "@/i18n/runtime";
import { Button } from "@/components/ui";
import type { TarsActionReceipt, TarsActionRecord } from "@/lib/tars/conversation";
import type { TarsWorkspaceAction } from "@/lib/tars/workspace-action";
import { TarsRecordDetail, TarsRecordRow } from "./TarsRecord";
import { useTarsActionUndo } from "./use-tars-action-undo";

export function describeTarsWorkspaceAction(action: TarsWorkspaceAction, workspace: string, applied = false) {
  const text = "text" in action ? action.text : "notes" in action ? action.notes : "url" in action ? action.title || action.url
    : "fieldId" in action ? action.fieldId : "todoId" in action ? action.todoId : "resourceId" in action ? action.resourceId : "";
  const preview = (text ?? "").replace(/\s+/g, " ").trim();
  return i18n.t(`shell:tars.workspaceAction.${applied ? "applied" : "propose"}.${action.operation}`, { workspace, text: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview });
}

export function TarsWorkspaceReceipt({ receipt, record, workspaceName }: { receipt: TarsActionReceipt; record?: TarsActionRecord; workspaceName?: string }) {
  const { t } = useTranslation(["shell"]);
  if (receipt.action.kind !== "workspace") return null;
  if (record) return <TarsWorkspaceRecord record={record} />;
  return <TarsRecordRow state={receipt.status === "rejected" ? "refused" : receipt.status} actor={{ by: "tars", hint: t("shell:tars.record.by.tars") }}
    subject={describeTarsWorkspaceAction(receipt.action, workspaceName || receipt.action.workspaceId, receipt.status === "applied")}
    status={t(`shell:tars.conversation.receipts.${receipt.status}`)} at={receipt.createdAt}
    data-tars-receipt={receipt.status} data-tars-receipt-kind="workspace"
    detail={receipt.status === "rejected" ? <TarsRecordDetail>{t("shell:tars.workspaceAction.refused")}</TarsRecordDetail> : null} />;
}

/** Reuses the record row's tokens and Undo path; model text never supplies restoration values. */
export function TarsWorkspaceRecord({ record }: { record: TarsActionRecord }) {
  const { t } = useTranslation(["shell"]);
  const undo = useTarsActionUndo(record);
  if (record.action.kind !== "workspace") return null;
  const workspace = record.undo?.kind === "workspace" ? record.undo.workspaceName : record.action.workspaceId;
  return <TarsRecordRow state="applied" actor={{ by: "tars", hint: t("shell:tars.record.by.tars") }}
    subject={describeTarsWorkspaceAction(record.action, workspace, true)} at={record.createdAt}
    status={t(undo.undone ? "shell:tars.record.undo.done" : "shell:tars.record.status.applied")}
    data-tars-receipt="applied" data-tars-receipt-kind="workspace" data-tars-workspace-operation={record.action.operation}
    actions={undo.available ? <Button type="button" variant="ghost" size="2xs" disabled={undo.pending} onClick={() => void undo.undo()}
      data-tars-record-undo="workspace">{t(undo.pending ? "shell:tars.record.undo.pending" : "shell:tars.record.undo.action")}</Button> : null}
    detail={undo.refusal ? <TarsRecordDetail role="status">{t(`shell:tars.record.undo.${undo.refusal}`)}</TarsRecordDetail> : null} />;
}
