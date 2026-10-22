import { i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AsyncState } from "@/components/ads/utils/async";
import { WorkspaceLayout } from "@/components/ads/components/WorkspaceLayout";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { findLatestFinishedTurnId } from "@/lib/fleet/result-auto-review";
import { findStageRecord, stageToReview } from "@/lib/review/review-stage";
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
import { ReviewDecisions } from "./ReviewDecisions";
import { ReviewDiffPane } from "./ReviewDiffPane";
import { ReviewFileList } from "./ReviewFileList";
import { ReviewInspector } from "./ReviewInspector";
import { StageOutput, TurnOutput } from "./ReviewOutputs";
import { ReviewScopeBar, ReviewScopeLimits } from "./ReviewScopeBar";
import { reviewStyles as styles } from "./review.styles";
import { useDiffReviewData, useTurnReviewData, type ReviewData } from "./useReviewData";

const NOTHING_READ: readonly string[] = [];

/**
 * Review: the work of a task checked in one place, against one scope at a
 * time (D7, D13): changed files and outputs, the selected file's diff, and
 * the checks, Lens records and comments that weigh on the decision.
 */
export function TaskReviewSurface(props: { taskId: string }) {
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
  const shared = { taskId, workspaceId, cwd, detail, latestTurnId, available: scope.kind === "stage" && !available.includes("stage") ? [...available, "stage" as const] : available, onScope };
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
  latestTurnId: string | null;
  available: readonly ReviewScopeKind[];
  onScope: (kind: ReviewScopeKind) => void;
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
            <ReviewInspector taskId={taskId} scope={scope} detail={props.detail} />
          </div>
        }
      />
      <ReviewDecisions taskId={taskId} workspaceId={props.workspaceId} scope={scope} detail={props.detail} read={read} data={data} latestTurnId={props.latestTurnId} />
    </>
  );
}
