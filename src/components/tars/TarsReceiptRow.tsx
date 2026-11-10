import { Bot } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import type { TarsActionReceipt } from "@/lib/tars/conversation";
import { tarsControlReasonKey, tarsDelegateReasonKey } from "@/lib/tars/control-reasons";
import { TarsPublishReasonSchema } from "@/lib/tars/publication";
import { TarsRecordChip, TarsRecordDetail, TarsRecordRow, TarsWorkChip, type TarsRecordState } from "./TarsRecord";

/** A receipt's refusal key: a translated code when the host gave one; null keeps its diagnostic. */
export function tarsReceiptRefusalKey(receipt: TarsActionReceipt) {
  // An automatic follow-up's refusal reads the same for every kind of action.
  if (receipt.action.kind === "publish") { const parsed = TarsPublishReasonSchema.safeParse(receipt.reason); return `shell:tars.publish.reason.${parsed.success ? parsed.data : "unknown"}` as const; }
  if (receipt.reason === "notByFollowUp" || receipt.action.kind === "control" || receipt.action.kind === "ask" || receipt.action.kind === "show"
    || receipt.action.kind === "clear") return tarsControlReasonKey(receipt.reason);
  return receipt.action.kind === "delegate" ? tarsDelegateReasonKey(receipt.reason) : null;
}

const RECEIPT_STATE: Record<TarsActionReceipt["status"], TarsRecordState> = { applied: "applied", pending: "pending", rejected: "refused", proposed: "proposed" };

/**
 * One action Tars took from a message, as a record row with Tars's mark: what
 * it was asked to do, the work it was done to as a chip (a question as text),
 * the agent it named, how the host took it, and on its own line why it was
 * not applied.
 */
export function TarsReceiptRow({ receipt, titleOf, agentNameOf }: {
  receipt: TarsActionReceipt;
  titleOf?: (responsibilityId: string) => string | undefined;
  agentNameOf?: (agentId: string) => string | undefined;
}) {
  const { t } = useTranslation(["shell"]);
  const { action } = receipt;
  const work = (id: string) => <TarsWorkChip key="work" title={titleOf?.(id) ?? id} responsibilityId={id} />;
  // A delegation names work that exists once it is applied; until then its title is only words.
  const [lead, subject, chip] = action.kind === "delegate"
    ? [t("shell:tars.record.delegate"), null, receipt.responsibilityId ? <TarsWorkChip key="work" title={action.title} responsibilityId={receipt.responsibilityId} />
      : <TarsRecordChip key="work" hint={action.title}>{action.title}</TarsRecordChip>]
    : action.kind === "control" ? [t(`shell:tars.record.operation.${action.operation}`), null, work(action.responsibilityId)]
      : action.kind === "ask" ? [t("shell:tars.record.ask"), action.question, null]
        : action.kind === "show" ? [t(`shell:tars.record.show.${action.view}`), null, work(action.responsibilityId)]
          : action.kind === "publish" ? [t("shell:tars.record.publish"), null, work(action.responsibilityId)]
            : action.kind === "clear" ? [t("shell:tars.record.clear"), formatList(action.scopes.map((scope) => t(`shell:tars.clear.scope.${scope}`))), null]
              : [t("shell:tars.record.reprioritize", { priority: action.priority }), null, work(action.responsibilityId)];
  const agent = action.kind === "delegate" && action.agentId ? action.agentId : null;
  const agentName = agent ? agentNameOf?.(agent) ?? agent : null;
  const refusal = receipt.error ? (() => { const key = tarsReceiptRefusalKey(receipt); return key ? t(key) : receipt.error; })() : null;
  return <TarsRecordRow state={RECEIPT_STATE[receipt.status]} actor={{ by: "tars", hint: t("shell:tars.record.by.tars") }} lead={lead} subject={subject}
    status={t(`shell:tars.conversation.receipts.${receipt.status}`)} at={receipt.createdAt}
    data-tars-receipt={receipt.status} data-tars-receipt-kind={action.kind}
    values={<>
      {chip}
      {agent ? <TarsRecordChip icon={Bot} hint={t("shell:tars.conversation.delegateAgent", { name: agentName })} data-tars-delegate-agent={agent}>{agentName}</TarsRecordChip> : null}
    </>}
    detail={refusal ? <TarsRecordDetail data-tars-reason={receipt.reason ?? undefined}>{refusal}</TarsRecordDetail> : null} />;
}
