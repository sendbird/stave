export type MessageRole = "user" | "assistant";

export type MessagePartType =
  | "text"
  | "thinking"
  | "tool_use"
  | "code_diff"
  | "file_context"
  | "image_context"
  | "approval"
  | "user_input"
  | "system_event"
  | "orchestration_progress"
  | "stave_processing";

export type Attachment =
  | { kind: "file"; filePath: string }
  | { kind: "image"; id: string; dataUrl: string; label: string };

export type ClaudePermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";
export type ClaudePermissionModeBeforePlan = Exclude<
  ClaudePermissionMode,
  "plan"
> | null;

export interface PromptDraftRuntimeOverrides {
  claudePermissionMode?: ClaudePermissionMode;
  claudePermissionModeBeforePlan?: ClaudePermissionModeBeforePlan;
  codexPlanMode?: boolean;
  model?: string;
}

export interface PromptDraftQueuedNextTurn {
  queuedAt: string;
  sourceTurnId?: string;
  content?: string;
}

export interface PromptDraft {
  text: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  queuedNextTurn?: PromptDraftQueuedNextTurn;
}

export interface MessagePartBase {
  type: MessagePartType;
}

export interface TextPart extends MessagePartBase {
  type: "text";
  text: string;
  /** Preserves provider-side text item boundaries across streamed deltas. */
  segmentId?: string;
}

export interface ThinkingPart extends MessagePartBase {
  type: "thinking";
  text: string;
  isStreaming: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface ToolUsePart extends MessagePartBase {
  type: "tool_use";
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  elapsedSeconds?: number;
  /** Progress messages streamed from a running subagent (Agent tool only). */
  progressMessages?: string[];
}

export interface CodeDiffPart extends MessagePartBase {
  type: "code_diff";
  filePath: string;
  oldContent: string;
  newContent: string;
  status: "pending" | "accepted" | "rejected";
}

export interface FileContextPart extends MessagePartBase {
  type: "file_context";
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}

export interface ApprovalPart extends MessagePartBase {
  type: "approval";
  toolName: string;
  description: string;
  requestId: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "approval-interrupted"
    | "output-denied";
}

export interface UserInputOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  key?: string;
  question: string;
  header: string;
  options: UserInputOption[];
  multiSelect?: boolean;
  inputType?: "text" | "number" | "integer" | "boolean" | "url_notice";
  required?: boolean;
  placeholder?: string;
  allowCustom?: boolean;
  defaultValue?: string;
  linkUrl?: string;
}

export interface UserInputPart extends MessagePartBase {
  type: "user_input";
  requestId: string;
  toolName: string;
  questions: UserInputQuestion[];
  answers?: Record<string, string>;
  state:
    | "input-requested"
    | "input-responded"
    | "input-interrupted"
    | "input-denied";
}

export interface ImageContextPart extends MessagePartBase {
  type: "image_context";
  dataUrl: string;
  label: string;
  mimeType: string;
}

export interface SystemEventPart extends MessagePartBase {
  type: "system_event";
  content: string;
  compactBoundary?: {
    trigger?: string;
    gitRef?: string;
  };
}

export interface StaveProcessingPart extends MessagePartBase {
  type: "stave_processing";
  strategy: "direct" | "orchestrate";
  /** The model chosen for direct execution. */
  model?: string;
  /** The supervisor model chosen for orchestration. */
  supervisorModel?: string;
  /** Short human-readable reason from the Pre-processor. */
  reason: string;
  /** Whether the Pre-processor flagged this as an urgent request. */
  fastModeRequested?: boolean;
  /** Whether fast mode was actually applied to the resolved provider. */
  fastModeApplied?: boolean;
}

export interface OrchestrationSubtaskState {
  id: string;
  title: string;
  model: string;
  status: "pending" | "running" | "done" | "error";
}

export interface OrchestrationProgressPart extends MessagePartBase {
  type: "orchestration_progress";
  supervisorModel: string;
  subtasks: OrchestrationSubtaskState[];
  status: "planning" | "executing" | "synthesizing" | "done";
}

export type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolUsePart
  | CodeDiffPart
  | FileContextPart
  | ImageContextPart
  | ApprovalPart
  | UserInputPart
  | SystemEventPart
  | OrchestrationProgressPart
  | StaveProcessingPart;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  model: string;
  providerId: "claude-code" | "codex" | "stave" | "user";
  content: string;
  startedAt?: string;
  completedAt?: string;
  isStreaming?: boolean;
  isPlanResponse?: boolean;
  planText?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
    ttftMs?: number;
  };
  promptSuggestions?: string[];
  parts: MessagePart[];
}

export type EditorTabContentState = "ready" | "deferred" | "loading";

export type TaskControlMode = "interactive" | "managed";
export type TaskControlOwner = "stave" | "external";

export interface Task {
  id: string;
  title: string;
  provider: "claude-code" | "codex" | "stave";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
  controlMode: TaskControlMode;
  controlOwner: TaskControlOwner;
  /** Legacy relative paths to persisted plan files kept for snapshot compatibility. */
  planFilePaths?: string[];
  /**
   * If set, this task is an ephemeral Coliseum branch of the referenced parent
   * task. Branch tasks are hidden from task trees/tabs and reaped when the user
   * picks a champion, dismisses the Coliseum, or the workspace reloads with a
   * stale branch still present. Never set on the parent task itself.
   */
  coliseumParentTaskId?: string | null;
}

/**
 * Possible status for a Coliseum run. Persisted beyond the first verdict so the
 * user can re-pick, review, or minimize/restore the arena without losing state.
 * - `running` — at least one branch is still streaming.
 * - `ready` — every branch has finished streaming; no champion picked yet.
 * - `promoted` — a champion was picked; branches stay alive for re-pick.
 * - `discarded` — user explicitly discarded the run; UI should clean up
 *   shortly after. Acts as a tombstone so deletion can be animated rather than
 *   happening mid-render.
 */
export type ColiseumRunStatus =
  | "running"
  | "ready"
  | "promoted"
  | "discarded";

/**
 * Arena layout mode. `grid` shows every branch side-by-side; `focus` promotes a
 * single branch to the main area while the rest collapse into a rail so the
 * user can concentrate on one answer without losing multi-branch context.
 */
export type ColiseumViewMode = "grid" | "focus";

/**
 * Authoritative per-branch metadata captured at fan-out time. The column
 * header reads `provider` / `model` from here rather than from the branch's
 * first assistant message, because assistant messages stream in with a lag
 * and cause every column to fall back to the provider label (making models
 * look identical).
 */
export interface ColiseumBranchMeta {
  branchTaskId: string;
  provider: "claude-code" | "codex" | "stave";
  model: string;
}

/**
 * Runtime state for the optional "reviewer" role that compares branch outputs
 * and surfaces a structured verdict. Populated by `launchColiseumReviewer` and
 * cleared by `clearColiseumReviewerVerdict`; absent on the group when the user
 * has not asked for a review yet.
 *
 * Kept on the group rather than in a separate map so it dies with the run
 * (close/discard clears everything together) and minimize/restore preserves it.
 */
export interface ColiseumReviewerVerdict {
  /** Monotonic lifecycle — no pause/resume. */
  status: "running" | "complete" | "error";
  /** Provider/model chosen for the review — shown in the verdict card header. */
  providerId: "claude-code" | "codex" | "stave";
  model: string;
  /** Accumulated assistant text (markdown). Streams in as the reviewer responds. */
  content: string;
  startedAt: string;
  completedAt?: string;
  /** Human-readable reason when `status === "error"`. */
  errorMessage?: string;
}

/**
 * Runtime-only state for a Coliseum — a multi-model parallel turn. Keyed in
 * the store by the parent task id. Not persisted — orphaned branch tasks are
 * reaped on workspace bootstrap if their parent's group is gone.
 *
 * The run is intentionally *not* destroyed when a champion is picked; branches
 * live on so the user can re-pick, compare further, or minimize the arena and
 * come back later. A separate `discardColiseumRun` action performs the actual
 * cleanup.
 */
export interface ColiseumGroupState {
  parentTaskId: string;
  /** Stable per-run id; lets future multi-run support key by id. */
  runId: string;
  branchTaskIds: string[];
  /** Keyed by branch task id. Authoritative source for provider/model. */
  branchMeta: Record<string, ColiseumBranchMeta>;
  createdAt: string;
  /**
   * Number of messages in the parent task at fan-out time. Each branch's
   * `messagesByTask[childTaskId]` begins with exactly this many parent messages
   * copied verbatim; everything from index `parentMessageCountAtFanout` onward
   * is the branch's own user message + streaming assistant response.
   *
   * Used by `pickColiseumChampion` to compute the champion-only diff to graft
   * onto the parent, and by `unpickColiseumChampion` to revert.
   */
  parentMessageCountAtFanout: number;
  /**
   * Whether the arena is running, ready, promoted, or discarded. Renderers key
   * UI affordances off this (e.g. hide "Pick champion" while `running`).
   */
  status: ColiseumRunStatus;
  /** Current champion (if any). `null` when no pick has been made. */
  championTaskId?: string | null;
  /**
   * Ordered history of picks so the user can see what they tried before. Every
   * `pickColiseumChampion` call appends to this list; unpick does not pop.
   */
  pickedHistory: Array<{ championTaskId: string; pickedAt: string }>;
  /** Arena layout preference; toggled from the arena header. */
  viewMode: ColiseumViewMode;
  /** When `viewMode === "focus"`, the branch promoted to the main area. */
  focusedBranchTaskId?: string | null;
  /**
   * Transient UI flag — when true, the session area hides the arena and shows
   * the regular ChatPanel + a "Coliseum paused" pill the user can click to
   * restore. Branches are fully alive; nothing destructive happens.
   */
  minimized: boolean;
  /**
   * Optional reviewer verdict for this run. Undefined when no review has been
   * launched. See `ColiseumReviewerVerdict` for the lifecycle.
   */
  reviewerVerdict?: ColiseumReviewerVerdict;
  /**
   * Ephemeral task id hosting the reviewer turn. Kept on the group so discard
   * can abort + clean up the reviewer task alongside branches, and so message
   * streaming events routed through the existing provider-turn runtime can be
   * mirrored into `reviewerVerdict.content` without touching the main task
   * dispatch logic.
   *
   * Set via `launchColiseumReviewer`; cleared by `clearColiseumReviewerVerdict`
   * and by `discardColiseumRun`. The task itself has `coliseumParentTaskId`
   * set so the existing branch-visibility filter hides it from the task tree.
   */
  reviewerTaskId?: string | null;
}

export interface EditorTab {
  id: string;
  filePath: string;
  kind?: "text" | "image";
  language: string;
  content: string;
  contentState?: EditorTabContentState;
  originalContent?: string;
  savedContent?: string;
  baseRevision?: string | null;
  hasConflict: boolean;
  isDirty: boolean;
}
