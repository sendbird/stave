import { i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AsyncState } from "@/components/ads/utils/async";
import { WorkspaceLayout } from "@/components/ads/components/WorkspaceLayout";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord, type AgentRunStageRecord } from "@/lib/agent-runs/domain";
import { findLatestFinishedTurnId } from "@/lib/fleet/result-auto-review";
import {
  availableReviewScopes,
  defaultReviewScope,
  type ReviewScope,
  type ReviewScopeKind,
} from "@/lib/review/review-scope";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import { reviewScopeKey, useTaskReviewModeStore } from "@/store/task-review-mode-store";
import { describeReviewReadError } from "./review-errors";
import { ReviewDiffPane } from "./ReviewDiffPane";
import { ReviewFileList } from "./ReviewFileList";
import { ReviewInspector } from "./ReviewInspector";
import { StageOutput, TurnOutput } from "./ReviewOutputs";
import { ReviewScopeBar, ReviewScopeLimits } from "./ReviewScopeBar";
import { reviewStyles as styles } from "./review.styles";
import { useDiffReviewData, useTurnReviewData, type ReviewData } from "./useReviewData";

const NOTHING_READ: readonly string[] = [];

type StageIdentity = { agentRunId: string; stageId: string; attempt: number };

/**
 * The stage Review shows when asked for the stage scope without one named:
 * the latest stage that started, walking back from the current one (a stage
 * waiting for sign-off has not started, so this is the stage before it).
 */
export function stageToReview(detail: AgentRunDetail | undefined): StageIdentity | undefined {
  if (!detail) return undefined;
  const { stages } = detail.agentRun.workflow;
  for (let index = Math.min(detail.agentRun.currentStageIndex, stages.length - 1); index >= 0; index -= 1) {
    const record = latestStageRecord(detail.stages, stages[index]!.id);
    if (record?.startHeadSha) return { agentRunId: detail.agentRun.id, stageId: record.stageId, attempt: record.attempt };
  }
  return undefined;
}

export function findStageRecord(detail: AgentRunDetail | undefined, scope: StageIdentity): AgentRunStageRecord | undefined {
  return detail?.stages.find((record) => record.agentRunId === scope.agentRunId && record.stageId === scope.stageId && record.attempt === scope.attempt);
}

/**
 * Review: the work of a task checked in one place, against one scope at a
 * time (D7, D13): changed files and outputs, the selected file's diff, and
 * the checks, Lens records and comments that weigh on the decision.
 */
export function TaskReviewSurface(props: { taskId: string; decisions?: (args: { scope: ReviewScope; detail: AgentRunDetail | undefined; read: readonly string[]; data: ReviewData | null }) => ReactNode }) {
  useTranslation();
  const { taskId } = props;
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const cwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath ?? null);
  const messages = useAppStore((state) => state.messagesByTask[taskId]);
  const activeTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const latestTurnId = useMemo(() => findLatestFinishedTurnId(messages, activeTurnId), [messages, activeTurnId]);
  const detail = useTaskAgentRun(workspaceId, taskId);
  const entry = useTaskReviewModeStore((state) => state.byTask[taskId]);
  const setScope = useTaskReviewModeStore((state) => state.setScope);
  const available = availableReviewScopes({ hasAgentRun: Boolean(detail), hasTurn: Boolean(latestTurnId) });
  const scope = entry?.scope ?? defaultReviewScope({ latestTurn: latestTurnId ? { taskId, turnId: latestTurnId } : undefined });
  const surfaceRef = useRef<HTMLElement>(null);
  // Opening Review moves focus into it, so the keyboard does not stay in a hidden composer.
  useEffect(() => surfaceRef.current?.focus(), []);
  const onScope = (kind: ReviewScopeKind) => {
    if (kind === "turn" && latestTurnId) setScope(taskId, { kind: "turn", taskId, turnId: latestTurnId });
    else if (kind === "stage") {
      const stage = scope.kind === "stage" ? scope : stageToReview(detail);
      if (stage) setScope(taskId, { kind: "stage", agentRunId: stage.agentRunId, stageId: stage.stageId, attempt: stage.attempt });
    } else if (kind === "branch" || kind === "uncommitted") setScope(taskId, { kind });
  };
  const shared = { taskId, workspaceId, cwd, detail, available: scope.kind === "stage" && !available.includes("stage") ? [...available, "stage" as const] : available, onScope, decisions: props.decisions };
  return (
    <section ref={surfaceRef} tabIndex={-1} className={sx(styles.surface)} aria-label={i18n.t("review:surface.label")} data-testid="task-review-surface">
      {scope.kind === "turn"
        ? <TurnScopeReview key={reviewScopeKey(scope)} scope={scope} {...shared} />
        : <DiffScopeReview key={reviewScopeKey(scope)} scope={scope} {...shared} />}
    </section>
  );
}

interface SharedProps {
  taskId: string;
  workspaceId: string;
  cwd: string | null;
  detail: AgentRunDetail | undefined;
  available: readonly ReviewScopeKind[];
  onScope: (kind: ReviewScopeKind) => void;
  decisions?: Parameters<typeof TaskReviewSurface>[0]["decisions"];
}

function TurnScopeReview(props: SharedProps & { scope: Extract<ReviewScope, { kind: "turn" }> }) {
  const { state, refresh } = useTurnReviewData({ workspaceId: props.workspaceId, taskId: props.taskId, turnId: props.scope.turnId });
  return <ReviewBody {...props} state={state} refresh={refresh} output={<TurnOutput workspaceId={props.workspaceId} taskId={props.taskId} turnId={props.scope.turnId} />} />;
}

function DiffScopeReview(props: SharedProps & { scope: Exclude<ReviewScope, { kind: "turn" }> }) {
  const record = props.scope.kind === "stage" ? findStageRecord(props.detail, props.scope) : undefined;
  const { state, refresh } = useDiffReviewData({ scope: props.scope, cwd: props.cwd, stage: record ? { startHeadSha: record.startHeadSha, facts: record.facts } : props.scope.kind === "stage" ? { startHeadSha: null, facts: null } : null });
  return <ReviewBody {...props} state={state} refresh={refresh} output={props.scope.kind === "stage" ? <StageOutput record={record} /> : null} />;
}

function ReviewBody(props: SharedProps & { scope: ReviewScope; state: AsyncState<ReviewData>; refresh: () => void; output: ReactNode }) {
  useTranslation();
  const { scope, state, taskId } = props;
  const data = state.status === "ready" ? state.data : null;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const files = data?.files ?? [];
  const selected = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  const read = useTaskReviewModeStore((store) => store.readByTask[taskId]?.[reviewScopeKey(scope)]) ?? NOTHING_READ;
  const markRead = useTaskReviewModeStore((store) => store.markRead);
  const selectedFile = selected?.path ?? null;
  useEffect(() => {
    if (selectedFile) markRead(taskId, scope, selectedFile);
    // The scope is fixed for this body (it is keyed by scope).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, taskId, markRead]);
  return (
    <>
      <ReviewScopeBar scope={scope} available={props.available} data={data} onScope={props.onScope} onRefresh={props.refresh} />
      <ReviewScopeLimits limits={data?.limits ?? (scope.kind === "turn" ? ["reported-edits-only"] : [])} />
      <WorkspaceLayout
        fill
        xstyle={styles.layout}
        rail={
          <div className={sx(styles.region)} role="region" aria-label={i18n.t("review:files.title")}>
            <AsyncBoundary state={state} onRetry={props.refresh} describeError={describeReviewReadError}>
              {(value) => value.missing
                ? <p className={sx(styles.note)}>{i18n.t("review:files.turnMissing")}</p>
                : <ReviewFileList files={value.files} selected={selected?.path ?? null} read={read} onSelect={(file) => setSelectedPath(file.path)} />}
            </AsyncBoundary>
            {props.output}
          </div>
        }
        primary={
          <div className={sx(styles.region)} role="region" aria-label={i18n.t("review:diff.title")}>
            {data && selected
              ? <ReviewDiffPane key={`${selected.path}:${selected.oldPath ?? ""}`} scope={scope} cwd={props.cwd} data={data} file={selected} />
              : <p className={sx(styles.note)}>{data ? i18n.t("review:diff.noChanges") : ""}</p>}
          </div>
        }
        inspector={
          <div className={sx(styles.region)} role="region" aria-label={i18n.t("review:inspector.title")}>
            <ReviewInspector taskId={taskId} detail={props.detail} />
          </div>
        }
      />
      {props.decisions?.({ scope, detail: props.detail, read, data })}
    </>
  );
}
