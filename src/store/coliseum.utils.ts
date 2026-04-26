import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ChatMessage,
  ColiseumBranchMeta,
  ColiseumGroupState,
  ColiseumReviewerVerdict,
  ImageContextPart,
  MessagePart,
  PromptDraft,
  Task,
} from "@/types/chat";

import {
  buildMessageId,
  buildRecentTimestamp,
  createFileContextPart,
  createUserTextPart,
} from "@/store/chat-state-helpers";

/**
 * Pure helpers for the Coliseum feature (multi-model parallel turns).
 *
 * Why a dedicated module: keeping fan-out logic out of `app.store.ts` lets us
 * test the state transition without pulling in the whole Zustand store, and
 * makes the store-side action a thin orchestrator. Mirrors the pattern used
 * by `chat-state-helpers.ts` / `workspace-turn-replay.ts` / `task-turn-lifecycle.ts`.
 *
 * Scope: these helpers only build state patches — they do NOT dispatch provider
 * turns. Dispatch (calling `runProviderTurn`) is the caller's job; the patch
 * returned by `planColiseumFanOut` contains `branchDispatchList`, the per-branch
 * `{ taskId, turnId, provider, model }` tuples ready to hand off.
 */

/** Inclusive lower bound on branches per Coliseum. Below this there is no contest. */
export const MIN_COLISEUM_BRANCHES = 2;

/**
 * Inclusive upper bound on branches per Coliseum. Keeps the horizontal column
 * layout readable at typical window widths; anything larger is painful.
 */
export const MAX_COLISEUM_BRANCHES = 4;

/** A single entrant in a Coliseum fan-out. */
export interface ColiseumBranchSpec {
  provider: ProviderId;
  model: string;
  /** Optional pre-generated child taskId. Falls back to the supplied ID factory. */
  childTaskId?: string;
  /** Optional pre-generated child turnId. Falls back to the supplied ID factory. */
  turnId?: string;
}

/** Resolved, ready-to-dispatch per-branch target. */
export interface ColiseumBranchDispatch {
  taskId: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

export interface ColiseumFanOutInput {
  parentTask: Task;
  parentMessages: ChatMessage[];
  parentPromptDraft: PromptDraft | undefined;
  parentTaskWorkspaceId: string;
  branches: ColiseumBranchSpec[];
  content: string;
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
  imageContexts?: Array<{
    dataUrl: string;
    label: string;
    mimeType: string;
  }>;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTaskId?: () => string;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTurnId?: () => string;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createRunId?: () => string;
  /** Injected for deterministic tests. Defaults to ISO now. */
  now?: () => string;
}

export interface ColiseumFanOutResult {
  group: ColiseumGroupState;
  /** Child Task records to merge into state.tasks. */
  branchTasks: Task[];
  /** Per-child seeded messages (parent history + user msg + empty streaming assistant). */
  branchMessagesByTask: Record<string, ChatMessage[]>;
  branchMessageCountByTask: Record<string, number>;
  branchActiveTurnIdsByTask: Record<string, string>;
  branchProviderSessionByTask: Record<string, TaskProviderSessionState>;
  branchNativeSessionReadyByTask: Record<string, boolean>;
  branchPromptDraftByTask: Record<string, PromptDraft>;
  branchTaskWorkspaceIdById: Record<string, string>;
  /** One entry per branch in the same order as `input.branches`. */
  branchDispatchList: ColiseumBranchDispatch[];
}

function buildUserParts(args: {
  content: string;
  fileContexts?: ColiseumFanOutInput["fileContexts"];
  imageContexts?: ColiseumFanOutInput["imageContexts"];
}): MessagePart[] {
  const parts: MessagePart[] = [];
  if (args.fileContexts) {
    for (const fc of args.fileContexts) {
      parts.push(
        createFileContextPart({
          filePath: fc.filePath,
          content: fc.content,
          language: fc.language,
          instruction: fc.instruction,
        }),
      );
    }
  }
  if (args.imageContexts) {
    for (const ic of args.imageContexts) {
      parts.push({
        type: "image_context",
        dataUrl: ic.dataUrl,
        label: ic.label,
        mimeType: ic.mimeType,
      } satisfies ImageContextPart);
    }
  }
  if (args.content.trim().length > 0) {
    parts.push(createUserTextPart({ text: args.content }));
  }
  if (parts.length === 0) {
    parts.push(createUserTextPart({ text: args.content }));
  }
  return parts;
}

/**
 * Build the full state patch for starting a Coliseum. The caller applies the
 * returned fields via a single `set()` and then iterates `branchDispatchList`
 * to call `runProviderTurn` for each branch.
 *
 * Throws when the number of branches is out of range — caller should validate
 * first and show a user-facing error (the composer already enforces 2–4).
 */
export function planColiseumFanOut(
  input: ColiseumFanOutInput,
): ColiseumFanOutResult {
  if (input.branches.length < MIN_COLISEUM_BRANCHES) {
    throw new Error(
      `Coliseum requires at least ${MIN_COLISEUM_BRANCHES} branches (got ${input.branches.length}).`,
    );
  }
  if (input.branches.length > MAX_COLISEUM_BRANCHES) {
    throw new Error(
      `Coliseum allows at most ${MAX_COLISEUM_BRANCHES} branches (got ${input.branches.length}).`,
    );
  }

  const createTaskId = input.createTaskId ?? (() => crypto.randomUUID());
  const createTurnId = input.createTurnId ?? (() => crypto.randomUUID());
  const createRunId = input.createRunId ?? (() => crypto.randomUUID());
  const now = input.now ?? buildRecentTimestamp;

  const parentMessageCountAtFanout = input.parentMessages.length;
  const parentTitle = input.parentTask.title;
  const parentControlMode = input.parentTask.controlMode;
  const parentControlOwner = input.parentTask.controlOwner;

  // Precompute user message parts ONCE — identical across branches.
  const userParts = buildUserParts({
    content: input.content,
    fileContexts: input.fileContexts,
    imageContexts: input.imageContexts,
  });

  const branchTasks: Task[] = [];
  const branchMessagesByTask: Record<string, ChatMessage[]> = {};
  const branchMessageCountByTask: Record<string, number> = {};
  const branchActiveTurnIdsByTask: Record<string, string> = {};
  const branchProviderSessionByTask: Record<string, TaskProviderSessionState> =
    {};
  const branchNativeSessionReadyByTask: Record<string, boolean> = {};
  const branchPromptDraftByTask: Record<string, PromptDraft> = {};
  const branchTaskWorkspaceIdById: Record<string, string> = {};
  const branchDispatchList: ColiseumBranchDispatch[] = [];
  const branchTaskIds: string[] = [];
  const branchMeta: Record<string, ColiseumBranchMeta> = {};

  for (const branch of input.branches) {
    const childTaskId = branch.childTaskId ?? createTaskId();
    const turnId = branch.turnId ?? createTurnId();
    branchTaskIds.push(childTaskId);
    branchMeta[childTaskId] = {
      branchTaskId: childTaskId,
      provider: branch.provider,
      model: branch.model,
    };

    const childTask: Task = {
      id: childTaskId,
      title: parentTitle,
      provider: branch.provider,
      updatedAt: now(),
      unread: false,
      archivedAt: null,
      controlMode: parentControlMode,
      controlOwner: parentControlOwner,
      coliseumParentTaskId: input.parentTask.id,
    };
    branchTasks.push(childTask);

    const userMessage: ChatMessage = {
      id: buildMessageId({
        taskId: childTaskId,
        count: parentMessageCountAtFanout,
      }),
      role: "user",
      model: "user",
      providerId: "user",
      content: input.content,
      // Clone parts so each branch owns its own array (cheap; parts themselves are plain data).
      parts: userParts.map((part) => ({ ...part })),
    };

    const assistantMessage: ChatMessage = {
      id: buildMessageId({
        taskId: childTaskId,
        count: parentMessageCountAtFanout + 1,
      }),
      role: "assistant",
      model: branch.model,
      providerId: branch.provider,
      content: "",
      startedAt: now(),
      isStreaming: true,
      parts: [],
    };

    const nextMessages = [
      ...input.parentMessages,
      userMessage,
      assistantMessage,
    ];
    branchMessagesByTask[childTaskId] = nextMessages;
    branchMessageCountByTask[childTaskId] = nextMessages.length;
    branchActiveTurnIdsByTask[childTaskId] = turnId;
    branchProviderSessionByTask[childTaskId] = {};
    branchNativeSessionReadyByTask[childTaskId] = false;
    branchTaskWorkspaceIdById[childTaskId] = input.parentTaskWorkspaceId;

    // Seed the branch's prompt draft with the parent's runtime overrides (permission
    // mode, plan mode) so the branch runs under the same mode preset as the parent.
    // The user explicitly confirmed: "probably all-auto is fine" — inheriting the
    // parent's current overrides is the minimal surprise choice. Branch-specific
    // model is set here; the user's prompt text is not re-staged in the draft
    // because the prompt is already materialized in messagesByTask.
    const parentOverrides = input.parentPromptDraft?.runtimeOverrides;
    branchPromptDraftByTask[childTaskId] = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: parentOverrides
        ? { ...parentOverrides, model: branch.model }
        : { model: branch.model },
    };

    branchDispatchList.push({
      taskId: childTaskId,
      turnId,
      provider: branch.provider,
      model: branch.model,
    });
  }

  const group: ColiseumGroupState = {
    parentTaskId: input.parentTask.id,
    runId: createRunId(),
    branchTaskIds,
    branchMeta,
    createdAt: now(),
    parentMessageCountAtFanout,
    status: "running",
    championTaskId: null,
    pickedHistory: [],
    viewMode: "grid",
    focusedBranchTaskId: null,
    minimized: false,
  };

  return {
    group,
    branchTasks,
    branchMessagesByTask,
    branchMessageCountByTask,
    branchActiveTurnIdsByTask,
    branchProviderSessionByTask,
    branchNativeSessionReadyByTask,
    branchPromptDraftByTask,
    branchTaskWorkspaceIdById,
    branchDispatchList,
  };
}

/**
 * Validate branches before calling `planColiseumFanOut`. Returns null on success
 * or a user-facing error message. Kept pure so the composer can pre-check and
 * disable the submit button.
 */
export function validateColiseumBranches(
  branches: ColiseumBranchSpec[],
): string | null {
  if (branches.length < MIN_COLISEUM_BRANCHES) {
    return `Pick at least ${MIN_COLISEUM_BRANCHES} models for the Coliseum.`;
  }
  if (branches.length > MAX_COLISEUM_BRANCHES) {
    return `Coliseum supports at most ${MAX_COLISEUM_BRANCHES} models.`;
  }
  for (const branch of branches) {
    if (!branch.provider || !branch.model) {
      return "Every Coliseum entrant needs a provider and a model.";
    }
  }
  return null;
}

export interface PromoteColiseumChampionInput {
  group: ColiseumGroupState;
  championTaskId: string;
  /** Parent task's message history at promotion time. */
  parentMessages: ChatMessage[];
  /** Champion branch's full message history (parent prefix + branch turn). */
  championMessages: ChatMessage[];
  /**
   * Whether there was a previous pick whose graft needs to be rolled back
   * before applying the new champion's tail. When true, the first
   * `parentMessageCountAtFanout` messages of `parentMessages` are preserved
   * and everything after is replaced with the new champion's tail. Used to
   * implement "re-pick".
   */
  replacePreviousPick?: boolean;
}

export interface PromoteColiseumChampionResult {
  /**
   * New parent messages: parent history + champion's post-fan-out tail, with
   * IDs rewritten to the parent task id. When `replacePreviousPick` is true,
   * the previous champion's grafted tail is stripped first.
   */
  nextParentMessages: ChatMessage[];
  /** Count of messages appended from the champion (tail length). */
  appendedFromChampion: number;
}

/**
 * Compute the parent-side state patch for promoting a champion. Pure helper so
 * the lifecycle can be tested without the store.
 *
 * Key invariant: the champion's first `parentMessageCountAtFanout` messages
 * are verbatim copies of the parent's history at fan-out time. Everything past
 * that index is the branch's own user message + assistant response (plus any
 * follow-up churn). We graft the tail onto the parent, rewriting message IDs
 * so they are keyed by the parent task id and contiguous with the existing
 * `parentMessages` length.
 *
 * Non-destructive: does **not** return a branch-drop list. Branches stay alive
 * so the user can re-pick. Callers perform the actual drop via
 * `discardColiseumRun`, which is an explicit destructive action.
 *
 * Also clears any `isStreaming` flag on the grafted tail so the parent doesn't
 * render a stuck "waiting for response" state after the graft.
 */
export function promoteColiseumChampion(
  input: PromoteColiseumChampionInput,
): PromoteColiseumChampionResult {
  const { group, championTaskId, championMessages } = input;
  if (!group.branchTaskIds.includes(championTaskId)) {
    throw new Error(
      `Champion taskId ${championTaskId} is not a branch of group ${group.parentTaskId}.`,
    );
  }
  const { parentTaskId, parentMessageCountAtFanout } = group;

  // If re-picking, roll parent back to pre-fan-out, then graft the new champion.
  const preGraftParentMessages = input.replacePreviousPick
    ? input.parentMessages.slice(0, parentMessageCountAtFanout)
    : input.parentMessages;

  const championTail = championMessages.slice(parentMessageCountAtFanout);
  const rewrittenTail: ChatMessage[] = championTail.map((msg, index) => ({
    ...msg,
    id: `${parentTaskId}-m-${preGraftParentMessages.length + index + 1}`,
    // Force the grafted tail out of any streaming state — branches may still
    // be streaming in the arena, but the parent's grafted copy is a snapshot
    // of the champion's current content and should render as complete.
    isStreaming: false,
    parts: msg.parts.map((part) => ({ ...part })),
  }));
  return {
    nextParentMessages: [...preGraftParentMessages, ...rewrittenTail],
    appendedFromChampion: rewrittenTail.length,
  };
}

/**
 * Roll the parent's message history back to the pre-fan-out snapshot, undoing
 * a previous `promoteColiseumChampion` graft. Used when the user unpicks a
 * champion while the arena is still open.
 */
export function unpickColiseumChampion(input: {
  group: ColiseumGroupState;
  parentMessages: ChatMessage[];
}): { nextParentMessages: ChatMessage[] } {
  const { group, parentMessages } = input;
  const preGraft = parentMessages.slice(0, group.parentMessageCountAtFanout);
  return { nextParentMessages: preGraft };
}

/**
 * Derive the "live" status of a Coliseum run from branch turn state.
 *
 * - If any branch has a live `activeTurnId`, status is `running`.
 * - Otherwise, if a champion has been picked, status is `promoted`.
 * - Otherwise, status is `ready`.
 *
 * `discarded` is not derivable from branch turn state — it is set explicitly
 * by `discardColiseumRun` before removal and is used as a tombstone.
 */
export function deriveColiseumRunStatus(input: {
  group: ColiseumGroupState;
  activeTurnIdsByTask: Record<string, string | undefined>;
}): Exclude<ColiseumGroupState["status"], "discarded"> {
  for (const branchTaskId of input.group.branchTaskIds) {
    if (input.activeTurnIdsByTask[branchTaskId]) {
      return "running";
    }
  }
  if (input.group.championTaskId) {
    return "promoted";
  }
  return "ready";
}

export interface ColiseumActivitySummary {
  runningArenaCount: number;
  runningBranchCount: number;
  runningReviewerCount: number;
  hasActivity: boolean;
}

/**
 * Keep the parent task plus all Coliseum-owned ephemeral tasks resident while
 * a run is still live in runtime state. Snapshot/cache compaction uses this to
 * avoid dropping finished branch messages out from under the arena.
 */
export function collectActiveColiseumTaskIds(input: {
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}) {
  const taskIds = new Set<string>();

  for (const group of Object.values(input.activeColiseumsByTask)) {
    if (!group) {
      continue;
    }

    taskIds.add(group.parentTaskId);
    for (const branchTaskId of group.branchTaskIds) {
      taskIds.add(branchTaskId);
    }
    if (group.reviewerTaskId) {
      taskIds.add(group.reviewerTaskId);
    }
  }

  return taskIds;
}

export function summarizeColiseumActivity(input: {
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
  activeTurnIdsByTask: Record<string, string | undefined>;
}): ColiseumActivitySummary {
  let runningArenaCount = 0;
  let runningBranchCount = 0;
  let runningReviewerCount = 0;

  for (const group of Object.values(input.activeColiseumsByTask)) {
    if (!group) {
      continue;
    }

    const branchRunningCount = group.branchTaskIds.reduce(
      (count, branchTaskId) =>
        count + (input.activeTurnIdsByTask[branchTaskId] ? 1 : 0),
      0,
    );
    const reviewerRunning = Boolean(
      (group.reviewerTaskId &&
        input.activeTurnIdsByTask[group.reviewerTaskId]) ||
      group.reviewerVerdict?.status === "running",
    );

    if (branchRunningCount > 0 || reviewerRunning) {
      runningArenaCount += 1;
    }
    runningBranchCount += branchRunningCount;
    if (reviewerRunning) {
      runningReviewerCount += 1;
    }
  }

  return {
    runningArenaCount,
    runningBranchCount,
    runningReviewerCount,
    hasActivity: runningArenaCount > 0,
  };
}

/**
 * Compute the state patch for removing a set of branch tasks entirely. Used by
 * `closeColiseumBranch`, `discardColiseumRun`, and (legacy) `dismissColiseum`.
 * Caller is responsible for also calling `cleanupTask({ taskId })` on the
 * provider IPC side to evict runtime caches.
 */
export function stripColiseumBranchesFromRecords<
  T extends Record<string, unknown>,
>(record: T, branchTaskIds: string[]): T {
  if (branchTaskIds.length === 0) {
    return record;
  }
  const branchSet = new Set(branchTaskIds);
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (branchSet.has(key)) {
      changed = true;
      continue;
    }
    next[key] = record[key];
  }
  return (changed ? next : record) as T;
}

/** ============================================================================
 * Reviewer role helpers
 *
 * The reviewer is a single additional LLM turn that compares the branches'
 * outputs and surfaces a structured verdict. The *runtime* wiring (IPC +
 * provider dispatch + streaming reducer) is out of scope here; this module
 * only provides the pure transformations — branch summarization and prompt
 * assembly — that the action layer will consume.
 * ========================================================================= */

/**
 * Distilled summary of a single branch's output, suitable for handing to the
 * reviewer LLM. Keeping this an explicit shape means the prompt format can
 * evolve without leaking through the rest of the codebase.
 */
export interface ColiseumBranchSummary {
  branchTaskId: string;
  provider: ProviderId;
  model: string;
  /** Final assistant text (may be empty if the branch only used tools). */
  assistantText: string;
  /**
   * List of file paths the branch wrote/edited, deduped and in the order the
   * branch first touched them. Empty when the branch did no file changes.
   */
  changedFilePaths: string[];
  /**
   * Short one-line entries describing tool use — e.g. `"Bash: npm test"`,
   * `"Edit: src/foo.ts"`. The reviewer uses these to tell *how* the branch
   * reached its answer, not just *what* it wrote. Capped per branch to keep
   * the reviewer prompt bounded.
   */
  toolTrace: string[];
  /** Whether the branch was still streaming when summarized. */
  isStreaming: boolean;
}

const REVIEWER_TOOL_TRACE_LIMIT_PER_BRANCH = 6;

function extractFilePathFromToolInputRaw(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { file_path?: unknown; path?: unknown };
    if (typeof parsed?.file_path === "string" && parsed.file_path.length > 0) {
      return parsed.file_path;
    }
    if (typeof parsed?.path === "string" && parsed.path.length > 0) {
      return parsed.path;
    }
  } catch {
    // fall through — input isn't always JSON (e.g. Bash)
  }
  return null;
}

/**
 * Reduce a branch's post-fan-out message list to the information the reviewer
 * actually needs. Pulls only messages AFTER `parentMessageCountAtFanout` — the
 * branch's own user prompt + assistant response — and ignores the parent
 * prefix so the reviewer prompt stays compact.
 *
 * Pure: no store access, no provider calls. Tests exercise this directly.
 */
export function extractBranchSummary(input: {
  branchMeta: ColiseumBranchMeta;
  branchMessages: ChatMessage[];
  parentMessageCountAtFanout: number;
}): ColiseumBranchSummary {
  const { branchMeta, branchMessages, parentMessageCountAtFanout } = input;
  const tail = branchMessages.slice(parentMessageCountAtFanout);
  const assistantMessages = tail.filter((m) => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  const assistantText = assistantMessages
    .flatMap((msg) =>
      msg.parts
        .filter(
          (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
        )
        .map((p) => p.text),
    )
    .join("\n")
    .trim();

  const changedFilePaths: string[] = [];
  const seenFiles = new Set<string>();
  const toolTrace: string[] = [];

  for (const msg of assistantMessages) {
    for (const part of msg.parts) {
      if (part.type === "code_diff") {
        if (!seenFiles.has(part.filePath)) {
          seenFiles.add(part.filePath);
          changedFilePaths.push(part.filePath);
        }
      } else if (part.type === "tool_use") {
        // Keep tool trace short — the point is to give the reviewer a sense of
        // approach, not a full replay. We also snapshot file paths here because
        // some providers emit writes as `tool_use(Edit|Write|NotebookEdit)`
        // rather than a `code_diff` part.
        if (toolTrace.length < REVIEWER_TOOL_TRACE_LIMIT_PER_BRANCH) {
          const filePath = extractFilePathFromToolInputRaw(part.input);
          toolTrace.push(
            filePath ? `${part.toolName}: ${filePath}` : part.toolName,
          );
        }
        const fileEditingTools = new Set(["Edit", "Write", "NotebookEdit"]);
        if (fileEditingTools.has(part.toolName)) {
          const filePath = extractFilePathFromToolInputRaw(part.input);
          if (filePath && !seenFiles.has(filePath)) {
            seenFiles.add(filePath);
            changedFilePaths.push(filePath);
          }
        }
      }
    }
  }

  return {
    branchTaskId: branchMeta.branchTaskId,
    provider: branchMeta.provider,
    model: branchMeta.model,
    assistantText,
    changedFilePaths,
    toolTrace,
    isStreaming: Boolean(lastAssistant?.isStreaming),
  };
}

const REVIEWER_ASSISTANT_TEXT_MAX_CHARS = 2200;

function truncateForPrompt(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return {
    text: `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`,
    truncated: true,
  };
}

export interface BuildReviewerPromptInput {
  /** The exact prompt the user entered when they launched the Coliseum. */
  originalUserPrompt: string;
  /** One summary per branch, in the order the reviewer should consider them. */
  branchSummaries: ColiseumBranchSummary[];
}

/**
 * Assemble the markdown prompt handed to the reviewer LLM. The structure is
 * designed to elicit a structured verdict: TL;DR → per-branch scorecard →
 * key differences → recommendation. Kept pure so prompt churn is testable
 * and reviewable via the test file.
 */
export function buildReviewerPrompt(input: BuildReviewerPromptInput): string {
  const { originalUserPrompt, branchSummaries } = input;
  if (branchSummaries.length === 0) {
    throw new Error(
      "buildReviewerPrompt needs at least one branch summary to compare.",
    );
  }

  const lines: string[] = [];
  lines.push(
    "You are a senior code reviewer comparing the outputs of multiple models that were asked the same question in parallel (a 'Coliseum' run).",
  );
  lines.push("");
  lines.push("# User's original request");
  lines.push("");
  lines.push("```");
  lines.push(originalUserPrompt.trim() || "(empty)");
  lines.push("```");
  lines.push("");
  lines.push(`# Branches (${branchSummaries.length})`);
  lines.push("");
  branchSummaries.forEach((summary, idx) => {
    const label = `Branch ${idx + 1} — ${summary.provider} · ${summary.model}`;
    lines.push(`## ${label}`);
    if (summary.isStreaming) {
      lines.push("");
      lines.push("_Note: this branch was still streaming when captured._");
    }
    lines.push("");
    lines.push("**Final assistant text:**");
    lines.push("");
    const { text: safeText, truncated } = truncateForPrompt(
      summary.assistantText || "(no text — tool-only response)",
      REVIEWER_ASSISTANT_TEXT_MAX_CHARS,
    );
    lines.push("```");
    lines.push(safeText);
    lines.push("```");
    if (truncated) {
      lines.push("");
      lines.push("_(Reviewer: the text above was truncated for length.)_");
    }
    if (summary.changedFilePaths.length > 0) {
      lines.push("");
      lines.push("**Files changed:**");
      for (const filePath of summary.changedFilePaths) {
        lines.push(`- \`${filePath}\``);
      }
    }
    if (summary.toolTrace.length > 0) {
      lines.push("");
      lines.push("**Tool trace (truncated):**");
      for (const entry of summary.toolTrace) {
        lines.push(`- ${entry}`);
      }
    }
    lines.push("");
  });
  lines.push("# Your task");
  lines.push("");
  lines.push(
    "Produce a concise, opinionated review in markdown. Structure it as:",
  );
  lines.push("");
  lines.push(
    "1. **TL;DR recommendation** — which branch do you suggest the user pick, and why (one sentence).",
  );
  lines.push(
    "2. **Scorecard** — a short table of each branch with columns: Correctness, Completeness, Risk, Style. Use 1–5.",
  );
  lines.push(
    "3. **Key differences** — bullet points on where the branches diverge (approach, file choices, trade-offs).",
  );
  lines.push(
    "4. **Red flags** — anything that looks wrong or risky in any branch (bugs, security, missing edge cases).",
  );
  lines.push("");
  lines.push(
    "Be direct and specific. The user will use your review as input to picking a champion — don't hedge.",
  );
  return lines.join("\n");
}

export interface BuildColiseumMergedFollowUpInput {
  reviewerVerdict: Pick<ColiseumReviewerVerdict, "content">;
  branchSummaries: ColiseumBranchSummary[];
  championTaskId?: string | null;
}

const MERGED_FOLLOW_UP_REVIEW_MAX_CHARS = 2800;
const MERGED_FOLLOW_UP_BRANCH_TEXT_MAX_CHARS = 1600;

/**
 * Build a parent-task follow-up prompt that asks the model to synthesize one
 * merged answer from the Coliseum review + branch outputs. This is staged as a
 * draft on the parent task so the user can inspect/edit it before sending.
 */
export function buildColiseumMergedFollowUp(
  input: BuildColiseumMergedFollowUpInput,
): string {
  if (input.branchSummaries.length === 0) {
    throw new Error(
      "buildColiseumMergedFollowUp needs at least one branch summary.",
    );
  }

  const includedBranches = input.championTaskId
    ? input.branchSummaries.filter(
        (summary) => summary.branchTaskId !== input.championTaskId,
      )
    : input.branchSummaries;

  const lines: string[] = [];
  lines.push(
    "Please produce one merged final answer for this task using the Coliseum review and branch outputs below.",
  );
  if (input.championTaskId) {
    lines.push(
      "The current champion answer is already in this conversation. Treat it as the base answer, improve it, and pull in only the strongest ideas from the other branches.",
    );
  } else {
    lines.push(
      "No champion has been picked yet. Choose the best base approach from the branch outputs below and synthesize a single stronger final answer.",
    );
  }
  lines.push(
    "Follow the reviewer's recommendation where branches disagree, fix any red flags it calls out, and mention real trade-offs only when they materially matter.",
  );
  lines.push(
    "Return the merged answer itself. Do not explain the merge process unless it is directly useful to the user.",
  );
  lines.push("");
  lines.push("# Reviewer verdict");
  lines.push("");
  const { text: reviewerText } = truncateForPrompt(
    input.reviewerVerdict.content.trim() || "(review completed without text)",
    MERGED_FOLLOW_UP_REVIEW_MAX_CHARS,
  );
  lines.push("```md");
  lines.push(reviewerText);
  lines.push("```");
  lines.push("");

  if (input.championTaskId) {
    const champion = input.branchSummaries.find(
      (summary) => summary.branchTaskId === input.championTaskId,
    );
    if (champion) {
      lines.push(
        `Current champion already in the conversation: ${champion.provider} / ${champion.model}`,
      );
      lines.push("");
    }
  }

  lines.push(
    `# ${input.championTaskId ? "Other branch outputs" : "Branch outputs"}`,
  );
  lines.push("");

  includedBranches.forEach((summary, index) => {
    lines.push(
      `## Branch ${index + 1} — ${summary.provider} / ${summary.model}`,
    );
    if (summary.isStreaming) {
      lines.push("");
      lines.push("_Note: this branch was still streaming when captured._");
    }
    lines.push("");
    lines.push("**Final assistant text:**");
    lines.push("");
    const { text: branchText, truncated } = truncateForPrompt(
      summary.assistantText || "(no text — tool-only response)",
      MERGED_FOLLOW_UP_BRANCH_TEXT_MAX_CHARS,
    );
    lines.push("```");
    lines.push(branchText);
    lines.push("```");
    if (truncated) {
      lines.push("");
      lines.push("_(Branch text was truncated for length.)_");
    }
    if (summary.changedFilePaths.length > 0) {
      lines.push("");
      lines.push("**Files changed:**");
      for (const filePath of summary.changedFilePaths) {
        lines.push(`- \`${filePath}\``);
      }
    }
    if (summary.toolTrace.length > 0) {
      lines.push("");
      lines.push("**Tool trace (truncated):**");
      for (const entry of summary.toolTrace) {
        lines.push(`- ${entry}`);
      }
    }
    lines.push("");
  });

  lines.push('— (auto-generated from Coliseum "Draft merged answer")');
  return lines.join("\n");
}

export interface PlanReviewerLaunchInput {
  /** Parent (non-branch) task hosting the Coliseum run. */
  parentTask: Task;
  /** Current group state — used for id/workspace bookkeeping. */
  group: ColiseumGroupState;
  /** Workspace id the parent task lives in; reviewer reuses it. */
  parentTaskWorkspaceId: string;
  /** Reviewer provider/model choice. */
  reviewerProvider: ProviderId;
  reviewerModel: string;
  /** Composed reviewer prompt (from `buildReviewerPrompt`). */
  reviewerPrompt: string;
  /** Inherited runtime overrides from the parent task, if any. */
  parentPromptDraft?: PromptDraft;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTaskId?: () => string;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTurnId?: () => string;
  /** Injected for deterministic tests. Defaults to ISO now. */
  now?: () => string;
}

export interface PlanReviewerLaunchResult {
  /** The ephemeral reviewer task to merge into `state.tasks`. */
  reviewerTask: Task;
  /** Seeded messages for the reviewer task (reviewer prompt + empty assistant). */
  reviewerMessages: ChatMessage[];
  /** Stable turnId for the reviewer turn. */
  reviewerTurnId: string;
  /** Initial provider session record (empty). */
  reviewerProviderSession: TaskProviderSessionState;
  /** Initial verdict snapshot — streaming/empty text, no completedAt. */
  reviewerVerdict: ColiseumReviewerVerdict;
  /** Seed prompt draft mirroring parent overrides + reviewer model. */
  reviewerPromptDraft: PromptDraft;
  /** Next group state with `reviewerTaskId` + `reviewerVerdict` stamped. */
  nextGroup: ColiseumGroupState;
}

/**
 * Build the state patch for spinning up a reviewer turn. This is the mirror of
 * `planColiseumFanOut` but for a single task: the reviewer reuses
 * `coliseumParentTaskId` so the existing branch-visibility filter hides the
 * reviewer task from the main task tree (zero changes to `Task` itself or the
 * task list UI). The caller:
 *  - merges `reviewerTask` into `state.tasks`
 *  - seeds `messagesByTask[reviewerTask.id]` with `reviewerMessages`
 *  - stamps `activeTurnIdsByTask[reviewerTask.id] = reviewerTurnId`
 *  - stores `nextGroup` as the group state
 *  - dispatches `runProviderTurn` with the reviewer prompt
 *
 * Keeping this pure matches the pattern used by `planColiseumFanOut` and lets
 * tests exercise state transitions without touching the Zustand store.
 */
export function planReviewerLaunch(
  input: PlanReviewerLaunchInput,
): PlanReviewerLaunchResult {
  const createTaskId = input.createTaskId ?? (() => crypto.randomUUID());
  const createTurnId = input.createTurnId ?? (() => crypto.randomUUID());
  const now = input.now ?? buildRecentTimestamp;

  const reviewerTaskId = createTaskId();
  const reviewerTurnId = createTurnId();

  const reviewerTask: Task = {
    id: reviewerTaskId,
    // Title doubles as a stable debug label; hidden from task tree via the
    // `coliseumParentTaskId` filter so the exact text is cosmetic.
    title: `Coliseum Reviewer · ${input.parentTask.title}`,
    provider: input.reviewerProvider,
    updatedAt: now(),
    unread: false,
    archivedAt: null,
    controlMode: input.parentTask.controlMode,
    controlOwner: input.parentTask.controlOwner,
    coliseumParentTaskId: input.parentTask.id,
  };

  const userMessage: ChatMessage = {
    id: buildMessageId({ taskId: reviewerTaskId, count: 0 }),
    role: "user",
    model: "user",
    providerId: "user",
    content: input.reviewerPrompt,
    parts: [createUserTextPart({ text: input.reviewerPrompt })],
  };

  const assistantMessage: ChatMessage = {
    id: buildMessageId({ taskId: reviewerTaskId, count: 1 }),
    role: "assistant",
    model: input.reviewerModel,
    providerId: input.reviewerProvider,
    content: "",
    startedAt: now(),
    isStreaming: true,
    parts: [],
  };

  const reviewerMessages: ChatMessage[] = [userMessage, assistantMessage];

  const reviewerVerdict: ColiseumReviewerVerdict = {
    status: "running",
    providerId: input.reviewerProvider,
    model: input.reviewerModel,
    content: "",
    startedAt: now(),
  };

  const parentOverrides = input.parentPromptDraft?.runtimeOverrides;
  const reviewerPromptDraft: PromptDraft = {
    text: "",
    attachedFilePaths: [],
    attachments: [],
    runtimeOverrides: parentOverrides
      ? { ...parentOverrides, model: input.reviewerModel }
      : { model: input.reviewerModel },
  };

  const nextGroup: ColiseumGroupState = {
    ...input.group,
    reviewerTaskId,
    reviewerVerdict,
  };

  return {
    reviewerTask,
    reviewerMessages,
    reviewerTurnId,
    reviewerProviderSession: {},
    reviewerVerdict,
    reviewerPromptDraft,
    nextGroup,
  };
}

/**
 * Remove the reviewer from a group. Pure — used by `clearColiseumReviewerVerdict`
 * and by `discardColiseumRun` when tearing the whole run down.
 */
export function clearReviewerFromGroup(
  group: ColiseumGroupState,
): ColiseumGroupState {
  if (!group.reviewerTaskId && !group.reviewerVerdict) {
    return group;
  }
  const next: ColiseumGroupState = { ...group };
  delete next.reviewerTaskId;
  delete next.reviewerVerdict;
  return next;
}

export interface ReapColiseumOrphansInput {
  tasks: Task[];
  /** Runtime group state keyed by parent task id. Freshly empty on bootstrap. */
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}

export interface ReapColiseumOrphansResult {
  /** Tasks with orphan branches removed. Same reference when there are none. */
  tasks: Task[];
  /** Branch task ids that were dropped (callers use this to strip message maps). */
  orphanedBranchTaskIds: string[];
}

/**
 * Identify Coliseum branch tasks whose parent group no longer exists in runtime
 * state, and remove them. Called when a workspace snapshot is loaded from disk:
 * `activeColiseumsByTask` is always empty on bootstrap (runtime-only), so every
 * persisted branch task is an orphan. Keeping the helper generic (compares to
 * `activeColiseumsByTask`) makes it reusable mid-session if we ever need to
 * reap after a partial state restore.
 */
export function reapColiseumOrphans(
  input: ReapColiseumOrphansInput,
): ReapColiseumOrphansResult {
  const liveGroupBranchIds = new Set<string>();
  for (const group of Object.values(input.activeColiseumsByTask)) {
    if (!group) continue;
    for (const branchId of group.branchTaskIds) {
      liveGroupBranchIds.add(branchId);
    }
  }
  const orphanedBranchTaskIds: string[] = [];
  const keptTasks = input.tasks.filter((task) => {
    if (!task.coliseumParentTaskId) return true;
    if (liveGroupBranchIds.has(task.id)) return true;
    orphanedBranchTaskIds.push(task.id);
    return false;
  });
  if (orphanedBranchTaskIds.length === 0) {
    return { tasks: input.tasks, orphanedBranchTaskIds };
  }
  return { tasks: keptTasks, orphanedBranchTaskIds };
}
