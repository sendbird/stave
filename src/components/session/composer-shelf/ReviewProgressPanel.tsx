import { useCallback, useMemo, useState } from "react";
import { Check, Paperclip, RefreshCw, RotateCcw } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { toast } from "@/components/ui";
import {
  AgentProgressControllerView,
  type AgentPanelChrome,
} from "@/components/agent-progress/AgentProgressControllerView";
import { revealInConversation, type AgentStepContext } from "@/components/agent-progress/agent-progress-targets";
import { useChildTaskSteps, type AgentProgressController } from "@/components/agent-progress/use-agent-progress";
import { progressFromExchange } from "@/lib/agent-progress";
import { reviewFindingsToRecheck } from "@/lib/reviews/review-findings";
import { useAgentProgressPanelStore, type AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";
import { recheckReviewTask, rerunReviewTask } from "@/store/review-task-runtime";
import { buildReviewExchange } from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";
import { ReviewFindingsPanel } from "./ReviewFindingsPanel";
import { ReviewRevisionNotice } from "./ReviewRevisionNotice";
import { useReviewRevision } from "./use-review-revision";
import { useReviewTranscript } from "./use-review-transcript";
import { useShelfReviews } from "./use-shelf-reviews";

/**
 * A review in the Agent panel: how it reviewed (the shared progress view of
 * its task), then its findings to attach or re-check, with Attach, Run again,
 * Stop and Open task. It follows its shelf row while the row is on the shelf
 * and keeps the last copy once the row leaves.
 */
export function ReviewProgressPanel(props: {
  target: Extract<AgentProgressTarget, { kind: "review" }>;
  chrome: AgentPanelChrome;
}) {
  useTranslation();
  const { target } = props;
  const reviews = useShelfReviews(target.parentTaskId);
  const item = reviews.items.find((row) => row.child.delegationKey === target.delegationKey) ?? target.snapshot;
  const { actions } = reviews;
  const attached = reviews.attachedTaskIds.has(item.child.delegatedTaskId);
  const live = item.status === "running";
  const taskTitle = useAppStore((state) => state.tasks.find((task) => task.id === item.child.delegatedTaskId)?.title);
  const parentTitle = useAppStore((state) => state.tasks.find((task) => task.id === target.parentTaskId)?.title);
  const title = taskTitle?.trim() || i18n.t("composer:shelfReviews.title");
  const { transcript, findings } = useReviewTranscript(item);
  const { state: revision, refresh: refreshRevision } = useReviewRevision(item);
  const steps = useChildTaskSteps({
    taskId: item.child.delegatedTaskId,
    workspaceId: item.child.delegatedWorkspaceId,
    live,
    providerId: item.child.providerId,
    settleKey: item.status,
  });
  const attachedFindingIds = useAppStore((state) => {
    const chip = state.promptDraftByTask[item.child.parentTaskId]?.attachments.find(
      (attachment) => attachment.kind === "task-context" && attachment.taskId === item.child.delegatedTaskId,
    );
    return chip?.kind === "task-context" ? (chip.findingIds ?? null) : null;
  });

  const progress = useMemo(() => {
    const exchange = buildReviewExchange({ item, title, transcript });
    // The written answer, without the findings block meant for Stave.
    return progressFromExchange(exchange, {
      steps: steps.steps,
      source: "review",
      kindLabel: i18n.t("session:agentProgress.panel.kindReview"),
      parent: { label: parentTitle?.trim() || i18n.t("session:agentProgress.panel.thisTurn"), taskId: target.parentTaskId },
    });
  }, [item, title, transcript, steps.steps, parentTitle, target.parentTaskId, i18n.language]);

  const close = useAgentProgressPanelStore((state) => state.close);
  const [rerunning, setRerunning] = useState(false);
  const rerun = useCallback(async () => {
    const prompt = transcript?.prompt;
    if (!prompt || rerunning) return;
    setRerunning(true);
    const started = await rerunReviewTask({ getState: useAppStore.getState, review: item.child, prompt, title });
    setRerunning(false);
    if (!started.ok) {
      toast.error(i18n.t("composer:shelfReviews.copy"), { description: started.error });
      return;
    }
    toast.success(i18n.t("composer:shelfReviews.copy2"));
    close();
  }, [close, item.child, rerunning, title, transcript?.prompt]);
  const [rechecking, setRechecking] = useState(false);
  const recheck = useCallback(async () => {
    const prompt = transcript?.prompt;
    if (!prompt || !findings?.ok || rechecking) return;
    setRechecking(true);
    const started = await recheckReviewTask({
      getState: useAppStore.getState,
      review: item.child,
      originalPrompt: prompt,
      report: findings.report,
      title,
    });
    setRechecking(false);
    if (!started.ok) {
      toast.error(i18n.t("composer:shelfReviews.copy3"), { description: started.error });
      return;
    }
    toast.success(i18n.t("composer:shelfReviews.copy4"));
    close();
  }, [close, findings, item.child, rechecking, title, transcript?.prompt]);

  const context = useMemo<AgentStepContext>(
    () => ({ taskId: item.child.delegatedTaskId, workspaceId: item.child.delegatedWorkspaceId }),
    [item.child.delegatedTaskId, item.child.delegatedWorkspaceId],
  );
  const controller: AgentProgressController = {
    progress,
    loading: steps.loading,
    notice: null,
    context,
    hasOlder: steps.hasOlder,
    ...(steps.hasOlder ? { onLoadOlder: steps.loadOlder } : {}),
    onOpenParent: () => void revealInConversation({ taskId: target.parentTaskId }),
  };
  const lead = (
    <>
      <ReviewRevisionNotice state={revision} />
      {item.status === "ready" && findings ? (
        <ReviewFindingsPanel
          key={`${item.child.delegationKey}:${attachedFindingIds?.join(",") ?? ""}`}
          findings={findings}
          attachedFindingIds={attachedFindingIds}
          onAttachSelected={(findingIds) => actions.attach(item, { findingIds, replyId: transcript?.replyId ?? null })}
          onRecheck={
            findings.ok && reviewFindingsToRecheck(findings.report).length > 0 && transcript?.prompt
              ? () => void recheck()
              : null
          }
          recheckBusy={rechecking}
        />
      ) : null}
    </>
  );
  const extraActions = (
    <>
      {item.status !== "ready" ? null : attached ? (
        <span className={sx(styles.meta, styles.metaWithIcon)}>
          <Check aria-hidden className={sx(styles.markIcon)} />
          <span>{i18n.t("composer:shelfReviews.copy5")}</span>
        </span>
      ) : (
        <Button
          variant="quiet"
          size="xs"
          title={i18n.t("composer:shelfReviews.title2")}
          onClick={() => actions.attach(item)}
          xstyle={styles.itemAccent}
        >
          <Paperclip aria-hidden />
          {i18n.t("composer:shelfReviews.copy6")}
        </Button>
      )}
      {item.status !== "running" && transcript?.prompt ? (
        <Button
          variant="quiet"
          size="xs"
          disabled={rerunning}
          title={i18n.t("composer:shelfReviews.title3")}
          onClick={() => void rerun()}
        >
          <RotateCcw aria-hidden />
          {i18n.t("composer:shelfReviews.copy7")}
        </Button>
      ) : null}
      {/* Compares the workspace with what the review covered, now. */}
      <Button variant="quiet" size="xs" onClick={refreshRevision}>
        <RefreshCw aria-hidden />
        {i18n.t("session:agentProgress.panel.refresh")}
      </Button>
    </>
  );
  return (
    <AgentProgressControllerView
      target={target}
      controller={controller}
      chrome={props.chrome}
      lead={lead}
      extraActions={extraActions}
      onStop={live ? () => actions.stop(item) : undefined}
      onOpenTask={() => actions.open(item)}
    />
  );
}
