import { useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { isDelegationExchangeLive, type DelegationExchange } from "@/lib/delegation/exchange";
import { SubagentExchangeCard } from "./SubagentExchangeCard";
import { GitBranch } from "lucide-react";
import { useAppStore } from "@/store/app.store";
import { selectMessageSubagents } from "@/lib/delegation/message-subagents";
import { describeSubagentState, subagentResultLine, type SubagentMessage } from "@/lib/delegation/subagent-summary";
import { useTranscriptDelegations } from "./transcript-delegations-context";

/** Results remain in the reading column; full evidence expands in place. */
export function MessageSubagents(props: { message: SubagentMessage; taskId: string; readOnly?: boolean }) {
  useTranslation();
  const { children, blocked } = useTranscriptDelegations();
  const graph = useAppStore((state) => {
    if (props.readOnly || !props.message.turnId) return null;
    const current = state.providerTurnActivityByTask[props.taskId]?.workGraph ??
      state.retainedTurnActivityByTask[props.taskId]?.snapshot.workGraph;
    return current?.turnId === props.message.turnId ? current : null;
  });
  const rows = useMemo(() => selectMessageSubagents({
    message: props.message, taskId: props.taskId, graph,
    children: props.readOnly ? undefined : children,
    blocked: props.readOnly ? undefined : blocked,
  }), [props.message, props.taskId, props.readOnly, children, blocked, graph]);
  if (!rows.length) return null;
  return <section className={sx(styles.section)} aria-label={i18n.t("session:assistantTrace.subagents")} data-testid="message-subagents">
    <h3 className={sx(styles.heading)}><GitBranch className={sx(styles.icon)} aria-hidden="true" />{i18n.t("session:assistantTrace.subagents")}<span className={sx(styles.count)}>{formatNumber(rows.length)}</span></h3>
    {rows.map((exchange) => <ResultRow key={exchange.id} exchange={exchange}
      blockedKind={!props.readOnly && exchange.outcome.status === "needs_user" && exchange.ref.delegationKey
        ? blocked[exchange.ref.delegationKey] : undefined} />)}
  </section>;
}

function ResultRow({ exchange, blockedKind }: { exchange: DelegationExchange; blockedKind?: string }) {
  useTranslation();
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);
  const live = isDelegationExchangeLive(exchange);
  const now = useNow(live && exchange.timing.observed !== false, 1_000);
  const status = exchange.outcome.status === "returned"
    ? i18n.t("session:assistantTrace.resultReceived") : describeSubagentState(exchange);
  const preview = subagentResultLine(exchange) ?? exchange.outcome.progress?.at(-1) ??
    (live ? exchange.ask : i18n.t("session:assistantTrace.noResult"));
  const open = async () => {
    setOpening(true);
    setError(undefined);
    try {
      await useAppStore.getState().focusTaskAttention({
        taskId: exchange.ref.delegatedTaskId!, workspaceId: exchange.ref.delegatedWorkspaceId,
        refreshFromPersistence: true,
      });
      if (!useAppStore.getState().tasks.some((task) => task.id === exchange.ref.delegatedTaskId))
        setError(i18n.t("session:delegatedTaskRows.extraCopy91"));
    } catch {
      setError(i18n.t("session:delegatedTaskRows.extraCopy91"));
    } finally { setOpening(false); }
  };
  return <SubagentExchangeCard exchange={exchange} nowMs={now} status={status}
    preview={preview} statusNote={error}
    extraActions={exchange.ref.delegatedTaskId ? <Button size="xs" variant="outline" disabled={opening} onClick={() => void open()}>
      {blockedKind === "user-input" ? i18n.t("session:assistantTrace.needsAnswer")
        : blockedKind === "approval" ? i18n.t("session:assistantTrace.needsApproval")
        : i18n.t("session:assistantTrace.openChild")}
    </Button> : undefined}
  />;
}

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, marginBlock: vars["--aui-space-12"] },
  icon: { width: "1rem", height: "1rem", flexShrink: 0 },
  count: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-regular"] },
  heading: { margin: 0, display: "flex", alignItems: "center", gap: vars["--aui-space-8"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"], color: vars["--aui-color-text"] },
});
