import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_RUN_LIMITS, currentStageRecord } from "@/lib/agent-runs/domain";
import { useAppStore } from "@/store/app.store";
import { useAgentRunsStore, useAgentRunFailure, agentRunStageKey } from "@/store/agent-runs-store";
import { useScopedTaskAgentRun } from "./useAgentRun";

/** A managed child accepts guidance through its supervisor, without takeover. */
export function DelegatedAgentReplySlot() {
  const { detail, taskId } = useScopedTaskAgentRun();
  const parentTaskId = useAppStore(state => state.tasks.find(task => task.id === taskId)?.parentTaskId);
  const managed = useAppStore(state => state.tasks.find(task => task.id === taskId)?.controlMode === "managed");
  const activeTurnId = useAppStore(state => state.activeTurnIdsByTask[taskId]);
  const runCommand = useAgentRunsStore(state => state.runCommand);
  const agentRunId = detail?.agentRun.id ?? "";
  const busy = useAgentRunsStore(state => Boolean(state.pendingByAgentRun[agentRunId]));
  const record = detail ? currentStageRecord(detail) : null;
  const failure = useAgentRunFailure(agentRunId, record ? agentRunStageKey(record) : null);
  if (!parentTaskId || !managed || !detail || activeTurnId || detail.agentRun.state !== "running" || !record ||
      !["blocked", "stuck"].includes(record.status) || detail.agentRun.workflow.stages[detail.agentRun.currentStageIndex]?.kind !== "ai") return null;
  return <DelegatedAgentReplyCard key={`${agentRunId}:${record.stageId}:${record.attempt}`} busy={busy}
    failure={failure} onReply={async feedback => (await runCommand("reply", { agentRunId, stageId: record.stageId, attempt: record.attempt, feedback })).ok} />;
}

export function DelegatedAgentReplyCard(props: { busy: boolean; failure?: string | null; onReply: (feedback: string) => Promise<boolean> }) {
  const { t } = useTranslation("agentRuns");
  const id = useId();
  const [feedback, setFeedback] = useState("");
  return <form className={sx(styles.form)} onSubmit={event => { event.preventDefault();
    if (!props.busy && feedback.trim()) void props.onReply(feedback.trim()).then(ok => { if (ok) setFeedback(""); }); }}>
    <label htmlFor={id}>{t("delegatedReply.label")}</label>
    <p className={sx(styles.hint)}>{t("delegatedReply.hint")}</p>
    <Textarea id={id} value={feedback} maxLength={AGENT_RUN_LIMITS.maxFeedbackChars} rows={3}
      disabled={props.busy} onChange={event => setFeedback(event.target.value)} />
    <Button type="submit" size="sm" disabled={props.busy || !feedback.trim()}>{t("delegatedReply.send")}</Button>
    {props.failure ? <p role="alert">{props.failure}</p> : null}
  </form>;
}

const styles = stylex.create({
  form: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"], marginBottom: vars["--ads-space-12"], borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid", borderColor: vars["--ads-color-border"], borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-canvas"], color: vars["--ads-color-text"], fontSize: vars["--ads-font-size-body"] },
  hint: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
});
