import { i18n, useTranslation } from "@/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AsyncState } from "@/components/ads/utils/async";
import { WorkspaceLayout } from "@/components/ads/components/WorkspaceLayout";
import { sx } from "@/components/ads/utils/stylex";
import { showTaskConversation } from "@/components/panes/task-surface-entry";
import { SideChatPanel } from "@/components/session/side-chat/SideChatPanel";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { findLatestFinishedTurnId } from "@/lib/fleet/result-auto-review";
import { findStageRecord, stageToReview } from "@/lib/review/review-stage";
import type { ReviewQueuePosition } from "@/lib/review/review-queue";
import { getSyntaxHighlighter } from "@/lib/syntax-highlight";
import {
  availableReviewScopes,
  defaultReviewScope,
  type ReviewScope,
  type ReviewScopeKind,
} from "@/lib/review/review-scope";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import { reviewScopeKey, useTaskReviewModeStore } from "@/store/task-review-mode-store";
import type { ReviewComment } from "@/types/review";
import { describeReviewReadError } from "./review-errors";
import { ReviewDecisions } from "./ReviewDecisions";
import type { ReviewLoadedFile } from "./ReviewComments";
import { ReviewDiffPane, type ReviewDiffReveal } from "./ReviewDiffPane";
import { ReviewFileList } from "./ReviewFileList";
import { ReviewInspector } from "./ReviewInspector";
import { StageOutput, TurnOutput } from "./ReviewOutputs";
import { ReviewScopeBar, ReviewScopeLimits } from "./ReviewScopeBar";
import { ReviewTaskStatusLine } from "./ReviewTaskStatusLine";
import { reviewStyles as styles } from "./review.styles";
import { useDiffReviewData, useTurnReviewData, type ReviewData } from "./useReviewData";
import { openReviewQueueItem, useReviewQueue } from "./useReviewQueue";

const NOTHING_READ: readonly string[] = [];

/** J and K move to the next and previous review waiting on the user. */
const REVIEW_STEP_BY_KEY: Readonly<Record<string, "next" | "previous">> = { j: "next", k: "previous" };

/**
 * J / K outside a text field open the next or previous waiting review. A key
 * another control already handled, a modified key and an IME composition
 * mean nothing here.
 */
function handleReviewQueueKey(event: KeyboardEvent<HTMLElement>, position: ReviewQueuePosition) {
  const direction = REVIEW_STEP_BY_KEY[event.key];
  if (
    !direction ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.nativeEvent.isComposing ||
    isEditableShortcutTarget(event.target)
  ) {
    return;
  }
  const target = position[direction];
  if (!target) return;
  event.preventDefault();
  void openReviewQueueItem(target);
}

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
  const queue = useReviewQueue({ workspaceId, taskId });
  const surfaceRef = useRef<HTMLElement>(null);
  // Opening Review moves focus into it, so the keyboard does not stay in a
  // hidden composer; so does moving on to another task's review with J / K.
  useEffect(() => surfaceRef.current?.focus(), [taskId]);
  const onScope = (kind: ReviewScopeKind) => {
    if (kind === "turn" && latestTurnId) setScope(taskId, { kind: "turn", taskId, turnId: latestTurnId });
    else if (kind === "stage") {
      const stage = scope.kind === "stage" ? scope : stageToReview(detail);
      if (stage) setScope(taskId, { kind: "stage", agentRunId: stage.agentRunId, stageId: stage.stageId, attempt: stage.attempt });
    } else if (kind === "branch" || kind === "uncommitted") setScope(taskId, { kind });
  };
  const shared = { taskId, workspaceId, cwd, detail, latestTurnId, queue, available: scope.kind === "stage" && !available.includes("stage") ? [...available, "stage" as const] : available, onScope };
  return (
    <section
      ref={surfaceRef}
      tabIndex={-1}
      className={sx(styles.surface)}
      aria-label={i18n.t("review:surface.label")}
      data-testid="task-review-surface"
      onKeyDown={(event) => handleReviewQueueKey(event, queue)}
    >
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
  queue: ReviewQueuePosition;
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
  // Load the diff highlighter while the scope's files are still being read, so the first diff paints in color.
  useEffect(() => {
    void getSyntaxHighlighter();
  }, []);
  // A newly selected file starts at its top, not at the previous file's scroll position.
  const diffRegion = useRef<HTMLDivElement>(null);
  const selectedKey = selected ? `${selected.path}:${selected.oldPath ?? ""}` : null;
  useLayoutEffect(() => {
    diffRegion.current?.scrollTo({ top: 0 });
  }, [selectedKey]);
  // The selected file's working-tree text, for the sent comments' check. A
  // turn's diff is that turn's snapshot, not the file now, so it is not used.
  const [loadedFile, setLoadedFile] = useState<ReviewLoadedFile | null>(null);
  const onContent = useCallback((path: string, content: string) => {
    setLoadedFile((current) => (current?.path === path && current.content === content ? current : { path, content }));
  }, []);
  // A comment row opens its line: in this scope's diff when the file is
  // listed here, otherwise in the editor at that line.
  const [reveal, setReveal] = useState<(ReviewDiffReveal & { path: string }) | null>(null);
  const jumpToComment = (comment: ReviewComment) => {
    if (files.some((file) => file.path === comment.filePath)) {
      setSelectedPath(comment.filePath);
      setReveal(comment.line ? { path: comment.filePath, line: comment.line, side: comment.side ?? "modified", nonce: Date.now() } : null);
      if (!comment.line) diffRegion.current?.focus();
      return;
    }
    void useAppStore.getState().openFileFromTree({ filePath: comment.filePath, ...(comment.line && comment.side !== "original" ? { line: comment.line } : {}) });
  };
  return (
    <>
      <ReviewTaskStatusLine taskId={taskId} />
      <ReviewScopeBar scope={scope} available={props.available} data={data} queueRemaining={props.queue.remaining} onScope={props.onScope} onRefresh={props.refresh} onConversation={() => showTaskConversation(taskId)} />
      <ReviewScopeLimits limits={data?.limits ?? (scope.kind === "turn" ? ["reported-edits-only"] : [])} />
      <div className={sx(styles.layoutHost)}>
      <div className={sx(styles.layoutScroll)}>
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
          <div ref={diffRegion} tabIndex={-1} className={sx(styles.region)} role="region" aria-label={i18n.t("review:diff.title")}>
            {data && selected
              // A file is read once its diff has shown, not when it is selected: a refused or failed read is not.
              ? <ReviewDiffPane
                  key={selectedKey}
                  taskId={taskId}
                  workspaceId={props.workspaceId}
                  scope={scope}
                  cwd={props.cwd}
                  data={data}
                  file={selected}
                  reveal={reveal?.path === selected.path ? reveal : null}
                  onShown={() => markRead(taskId, scope, selected.path)}
                  onContent={scope.kind === "turn" ? undefined : onContent}
                />
              : <p className={sx(styles.note)}>{data ? i18n.t("review:diff.noChanges") : ""}</p>}
          </div>
        }
        inspector={
          <div className={sx(styles.region)} role="region" aria-label={i18n.t("review:inspector.title")}>
            <ReviewInspector
              taskId={taskId}
              workspaceId={props.workspaceId}
              scope={scope}
              detail={props.detail}
              onJumpToComment={jumpToComment}
              loadedFile={scope.kind === "turn" ? null : loadedFile}
            />
          </div>
        }
      />
      </div>
        <div className={sx(styles.overlay)}>
          <SideChatPanel taskId={taskId} host="review" />
        </div>
      </div>
      <ReviewDecisions taskId={taskId} workspaceId={props.workspaceId} scope={scope} detail={props.detail} read={read} data={data} latestTurnId={props.latestTurnId} nextReview={props.queue.next} />
    </>
  );
}
