import { useTranslation } from "@/i18n";
import type { TarsActionReceipt } from "@/lib/tars/conversation";
import { tarsControlReasonKey, tarsDelegateReasonKey } from "@/lib/tars/control-reasons";
import { TarsPublishReasonSchema } from "@/lib/tars/publication";
import { TarsRecordDetail, TarsRecordRow, type TarsRecordState } from "./TarsRecord";

/** A receipt's refusal key: a translated code when the host gave one; null keeps its diagnostic. */
export function tarsReceiptRefusalKey(receipt: TarsActionReceipt) {
  // An automatic follow-up's refusal reads the same for every kind of action.
  if (receipt.action.kind === "publish") { const parsed = TarsPublishReasonSchema.safeParse(receipt.reason); return `shell:tars.publish.reason.${parsed.success ? parsed.data : "unknown"}` as const; }
  if (receipt.reason === "notByFollowUp" || receipt.action.kind === "control" || receipt.action.kind === "ask" || receipt.action.kind === "show") return tarsControlReasonKey(receipt.reason);
  return receipt.action.kind === "delegate" ? tarsDelegateReasonKey(receipt.reason) : null;
}

const RECEIPT_STATE: Record<TarsActionReceipt["status"], TarsRecordState> = { applied: "applied", pending: "pending", rejected: "refused", proposed: "proposed" };

/** What an applied action did, in its own words ("Work added", "Paused"); other statuses read the same for every action. */
export function tarsReceiptStatusKey(receipt: Pick<TarsActionReceipt, "status" | "action">) {
  if (receipt.status !== "applied") return `shell:tars.conversation.receipts.${receipt.status}` as const;
  const { action } = receipt;
  return `shell:tars.conversation.receipts.appliedAction.${action.kind === "control" ? action.operation : action.kind}` as const;
}

/**
 * One action Tars took from a message, as a record row: what it was asked to
 * do and to what, the agent it named, how the host took it, and on its own
 * line why it was not applied.
 */
export function TarsReceiptRow({ receipt, titleOf, agentNameOf }: {
  receipt: TarsActionReceipt;
  titleOf?: (responsibilityId: string) => string | undefined;
  agentNameOf?: (agentId: string) => string | undefined;
}) {
  const { t } = useTranslation(["shell"]);
  const { action } = receipt;
  const title = (id: string) => titleOf?.(id) ?? id;
  const [lead, subject] = action.kind === "delegate" ? [t("shell:tars.record.delegate"), action.title]
    : action.kind === "control" ? [t(`shell:tars.record.operation.${action.operation}`), title(action.responsibilityId)]
      : action.kind === "ask" ? [t("shell:tars.record.ask"), action.question]
        : action.kind === "show" ? [t(`shell:tars.record.show.${action.view}`), title(action.responsibilityId)]
          : action.kind === "publish" ? [t("shell:tars.record.publish"), title(action.responsibilityId)]
            : [t("shell:tars.record.reprioritize", { priority: action.priority }), title(action.responsibilityId)];
  const agent = action.kind === "delegate" && action.agentId ? action.agentId : null;
  const refusal = receipt.error ? (() => { const key = tarsReceiptRefusalKey(receipt); return key ? t(key) : receipt.error; })() : null;
  return <TarsRecordRow state={RECEIPT_STATE[receipt.status]} lead={lead} subject={subject} status={t(tarsReceiptStatusKey(receipt))}
    data-tars-receipt={receipt.status} data-tars-receipt-kind={action.kind}
    meta={agent ? <span data-tars-delegate-agent={agent}>{t("shell:tars.conversation.delegateAgent", { name: agentNameOf?.(agent) ?? agent })}</span> : null}
    detail={refusal ? <TarsRecordDetail data-tars-reason={receipt.reason ?? undefined}>{refusal}</TarsRecordDetail> : null} />;
}
