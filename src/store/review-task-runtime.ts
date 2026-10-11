import { i18n } from "@/i18n/runtime";
import {
  normalizeReviewCommitRef,
  type LocalChangeReviewFocus,
} from "@/lib/local-change-review";
import type { ProviderId } from "@/lib/providers/provider.types";
import { snapshotProviderAccounts, type ProviderAccountSelection } from "@/lib/providers/provider-account-selection";
import { REVIEW_CUSTOM_PROMPT_MAX_CHARS, type ReviewPromptSelection } from "@/lib/reviews/review-prompts";
import {
  REVIEW_TASK_INSTRUCTIONS_MAX_CHARS,
  buildReviewDelegateArgs,
  buildReviewDelegationKey,
  buildReviewTaskPrompt,
  buildReviewTaskTitle,
  selectLatestReplyForReview,
  type ReviewTarget,
} from "@/lib/reviews/review-task";
import {
  buildReviewRecheckPrompt,
  reviewFindingsToRecheck,
  type ReviewFindingsReport,
} from "@/lib/reviews/review-findings";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { resolveDelegatedTaskActionError } from "@/lib/runs/delegated-task-view";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import {
  addTaskContextAttachment,
  createTaskContextAttachment,
} from "@/lib/task-context/attached-task-context";
import type { AppState } from "@/store/app-store.types";
import { resolveTaskWorkspaceContext } from "@/store/repository.utils";
import { flushPendingSnapshotPersists } from "@/store/workspace-session-state";

/**
 * Starts a composer review as its own read-only task and brings its answer
 * back as task context. The child is a delegation of the reviewed task, so it
 * runs under the host's read-only posture, beside whatever the task is doing,
 * and appears in the task's Subagents list.
 */

export interface ReviewTaskRequest extends Partial<ReviewPromptSelection> {
  reviewer: { providerId: ProviderId; model: string; label: string };
  effort?: string;
  target: ReviewTarget;
  focuses: readonly LocalChangeReviewFocus[];
  instructions?: string;
  /** Empty or absent runs without a skill. */
  skillSlug?: string;
  /** The commit or range the commit target reviews. */
  commitRef?: string;
  /** A plan or acceptance criteria to check the work against. */
  criteria?: string;
  /** Compatibility for requests without an explicit rubric source. */
  skillOptional?: boolean;
}

export type StartReviewTaskResult =
  | { ok: true; delegationKey: string; delegatedTaskId: string | null }
  | { ok: false; error: string };

export function isReviewTaskDelegationAvailable() {
  return typeof window !== "undefined" && Boolean(window.api?.runs?.delegateTask);
}

function randomNonce() {
  return Math.random().toString(36).slice(2, 10);
}

export async function startReviewTask(args: {
  getState: () => AppState;
  taskId: string;
  request: ReviewTaskRequest;
  now?: Date;
  nonce?: string;
}): Promise<StartReviewTaskResult> {
  if (!isReviewTaskDelegationAvailable()) {
    return { ok: false, error: i18n.t("app:reviewRuntime.desktopRequired") };
  }
  const state = args.getState();
  const providerId = args.request.reviewer.providerId;
  if (providerId !== "claude-code" && providerId !== "codex") {
    return { ok: false, error: i18n.t("app:reviewRuntime.providerRequired") };
  }
  const repositoryPath = state.repositoryPath?.trim();
  if (!repositoryPath) {
    return { ok: false, error: i18n.t("app:reviewRuntime.openProject") };
  }
  const { workspaceId } = resolveTaskWorkspaceContext({
    taskId: args.taskId,
    activeWorkspaceId: state.activeWorkspaceId,
    taskWorkspaceIdById: state.taskWorkspaceIdById,
    workspacePathById: state.workspacePathById,
    workspaceDefaultById: state.workspaceDefaultById,
    repositoryPath,
  });
  if (!workspaceId) {
    return { ok: false, error: i18n.t("app:reviewRuntime.noWorkspace") };
  }

  const promptSource = args.request.promptSource ?? (args.request.skillSlug ? "skill" : "preset");
  const customPrompt = (args.request.customPrompt ?? state.settings.reviewTask.customPrompt)
    .slice(0, REVIEW_CUSTOM_PROMPT_MAX_CHARS).trim();
  if (promptSource === "custom" && !customPrompt) {
    return { ok: false, error: i18n.t("app:reviewRuntime.customPromptRequired") };
  }
  const skillSlug = promptSource === "skill"
    ? args.request.skillSlug?.trim().replace(/^\$/, "").toLowerCase() : undefined;
  const skill = skillSlug
    ? getEffectiveSkillEntries({ skills: state.skillCatalog.skills, providerId })
        .find((entry) => entry.slug.toLowerCase() === skillSlug)
    : undefined;
  if (promptSource === "skill" && !skill && (!args.request.skillOptional || args.request.promptSource === "skill")) {
    return {
      ok: false,
      error: skillSlug
        ? i18n.t("app:reviewRuntime.skillUnavailable", { skill: skillSlug })
        : i18n.t("app:reviewRuntime.skillRequired"),
    };
  }
  if (skill && !skill.instructions.trim()) {
    return { ok: false, error: i18n.t("app:reviewRuntime.skillInstructionsMissing", { skill: skill.slug }) };
  }

  const commitRef =
    args.request.target === "commit" ? normalizeReviewCommitRef(args.request.commitRef) : null;
  if (args.request.target === "commit" && !commitRef) {
    return { ok: false, error: i18n.t("app:reviewRuntime.enterCommit") };
  }
  const reply =
    args.request.target === "latest-reply"
      ? selectLatestReplyForReview(state.messagesByTask[args.taskId] ?? [])
      : null;
  const prompt = buildReviewTaskPrompt({
    target: args.request.target,
    focuses: args.request.focuses,
    instructions: args.request.instructions?.slice(0, REVIEW_TASK_INSTRUCTIONS_MAX_CHARS),
    savedInstructions: state.settings.reviewTask.instructions,
    skill: skill
      ? { name: skill.name, slug: skill.slug, instructions: skill.instructions }
      : null,
    reply,
    commitRef,
    criteria: args.request.criteria,
    promptSource: promptSource === "skill" && !skill ? "preset" : promptSource,
    presetId: args.request.presetId ?? state.settings.reviewTask.presetId,
    customPrompt,
  });
  if (!prompt) {
    return { ok: false, error: i18n.t("app:reviewRuntime.noReply") };
  }

  return delegateReview({
    taskId: args.taskId,
    repositoryPath,
    workspaceId,
    prompt,
    title: buildReviewTaskTitle({
      target: args.request.target,
      modelLabel: args.request.reviewer.label,
      commitRef,
    }),
    providerId,
    model: args.request.reviewer.model,
    effort: args.request.effort,
    // A review the user starts runs on the accounts selected now.
    accounts: snapshotProviderAccounts(state.settings),
    now: args.now,
    nonce: args.nonce,
  });
}

async function delegateReview(args: {
  taskId: string;
  repositoryPath: string;
  workspaceId: string;
  prompt: string;
  title: string;
  providerId: "claude-code" | "codex";
  model: string;
  effort?: string | null;
  accounts: ProviderAccountSelection;
  now?: Date;
  nonce?: string;
}): Promise<StartReviewTaskResult> {
  const delegateTask = window.api?.runs?.delegateTask;
  if (!delegateTask) {
    return { ok: false, error: i18n.t("app:reviewRuntime.desktopRequired") };
  }
  const delegationKey = buildReviewDelegationKey({
    now: args.now ?? new Date(),
    nonce: args.nonce ?? randomNonce(),
  });
  try {
    // The host checks that the parent task exists on disk; a task created a
    // moment ago may still sit in the snapshot debounce.
    await flushPendingSnapshotPersists().catch(() => undefined);
    const response = await delegateTask(
      buildReviewDelegateArgs({
        repositoryPath: args.repositoryPath,
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        delegationKey,
        prompt: args.prompt,
        title: args.title,
        providerId: args.providerId,
        model: args.model,
        effort: args.effort,
      }),
      { accounts: args.accounts },
    );
    const refusal = resolveDelegatedTaskActionError(response);
    if (refusal) {
      return { ok: false, error: refusal };
    }
    return {
      ok: true,
      delegationKey,
      delegatedTaskId: response.child?.delegatedTaskId ?? null,
    };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error && cause.message
          ? cause.message
          : i18n.t("app:reviewRuntime.startFailed"),
    };
  }
}

/**
 * The same review once more, as a new review task: the prompt the earlier one
 * received, on its provider, model and effort, against what the workspace
 * holds now. A reply review re-reads the reply it reviewed, not a newer one.
 */
export async function rerunReviewTask(args: {
  getState: () => AppState;
  review: Pick<
    DelegatedTaskSummary,
    "parentTaskId" | "delegatedWorkspaceId" | "providerId" | "requestedModel" | "requestedEffort"
  >;
  prompt: string;
  title: string;
  now?: Date;
  nonce?: string;
}): Promise<StartReviewTaskResult> {
  const repositoryPath = args.getState().repositoryPath?.trim();
  if (!repositoryPath) {
    return { ok: false, error: i18n.t("app:reviewRuntime.openToRerun") };
  }
  const prompt = args.prompt.trim();
  if (!prompt) {
    return { ok: false, error: i18n.t("app:reviewRuntime.instructionsUnreadable") };
  }
  return delegateReview({
    taskId: args.review.parentTaskId,
    repositoryPath,
    // Reviews run in the reviewed task's own workspace.
    workspaceId: args.review.delegatedWorkspaceId,
    prompt,
    title: args.title,
    providerId: args.review.providerId,
    model: args.review.requestedModel ?? "",
    effort: args.review.requestedEffort,
    accounts: snapshotProviderAccounts(args.getState().settings),
    now: args.now,
    nonce: args.nonce,
  });
}

/**
 * Re-check an earlier review: a new review task, on the same provider, model
 * and effort, that decides whether each earlier finding is resolved against
 * the workspace as it is now, instead of reviewing from scratch.
 */
export async function recheckReviewTask(args: {
  getState: () => AppState;
  review: Parameters<typeof rerunReviewTask>[0]["review"];
  originalPrompt: string;
  report: ReviewFindingsReport;
  title: string;
  now?: Date;
  nonce?: string;
}): Promise<StartReviewTaskResult> {
  if (reviewFindingsToRecheck(args.report).length === 0) {
    return { ok: false, error: i18n.t("app:reviewRuntime.noFindings") };
  }
  return rerunReviewTask({
    getState: args.getState,
    review: args.review,
    prompt: buildReviewRecheckPrompt({
      originalPrompt: args.originalPrompt,
      report: args.report,
    }),
    title: `Re-check · ${args.title.replace(/^Re-check · /, "")}`.slice(0, 200),
    now: args.now,
    nonce: args.nonce,
  });
}

/** Title of the chip a review's answer becomes, from the child's own title. */
export function resolveReviewAttachmentTitle(args: {
  child: Pick<DelegatedTaskSummary, "delegatedTaskId">;
  tasks: AppState["tasks"];
}) {
  return (
    args.tasks.find((task) => task.id === args.child.delegatedTaskId)?.title?.trim() ||
    i18n.t("notifications:reviewTaskRuntime.reviewResult")
  );
}

export type AttachReviewResult =
  | "attached"
  | "attached-with-prompt"
  | "updated"
  /** The same review, with the same choice, is already on the draft. */
  | "already-attached"
  /** The draft cannot take another task. */
  | "unchanged";

function sameIds(left: readonly string[] | undefined, right: readonly string[] | undefined) {
  const a = [...(left ?? [])].sort();
  const b = [...(right ?? [])].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Attach a finished review's final reply to the reviewed task's draft. An
 * empty draft also receives the saved follow-up prompt, so the request that
 * goes with the findings is ready to send; text the user wrote is never
 * replaced. Returns "unchanged" when the review is already attached or the
 * draft is full.
 */
export function attachReviewResultToDraft(args: {
  getState: () => AppState;
  taskId: string;
  child: Pick<DelegatedTaskSummary, "delegatedTaskId" | "delegatedWorkspaceId">;
  /** Send only these structured findings; omitted sends the whole reply. */
  findingIds?: readonly string[];
  /** The reply the findings were read from, so later turns cannot re-point them. */
  findingsReplyId?: string | null;
}): AttachReviewResult {
  const state = args.getState();
  const draft = state.promptDraftByTask[args.taskId];
  const attachments = draft?.attachments ?? [];
  const findingIds = args.findingIds?.length ? [...new Set(args.findingIds)] : undefined;
  const replyAnchor = findingIds && args.findingsReplyId ? { findingsReplyId: args.findingsReplyId } : {};
  // Choosing findings again replaces the earlier choice on the same chip.
  const existing = attachments.find(
    (attachment) =>
      attachment.kind === "task-context" && attachment.taskId === args.child.delegatedTaskId,
  );
  if (existing) {
    if (existing.kind !== "task-context") {
      return "unchanged";
    }
    if (sameIds(existing.findingIds, findingIds)) {
      return "already-attached";
    }
    state.updatePromptDraft({
      taskId: args.taskId,
      patch: {
        attachments: attachments.map((attachment) => {
          if (attachment !== existing || attachment.kind !== "task-context") return attachment;
          const { findingIds: _previous, findingsReplyId: _reply, ...rest } = attachment;
          return findingIds ? { ...rest, findingIds, ...replyAnchor } : rest;
        }),
      },
    });
    return "updated";
  }
  const next = addTaskContextAttachment({
    attachments,
    attachment: {
      ...createTaskContextAttachment({
        taskId: args.child.delegatedTaskId,
        workspaceId: args.child.delegatedWorkspaceId,
        title: resolveReviewAttachmentTitle({ child: args.child, tasks: state.tasks }),
        scope: "latest-reply",
      }),
      ...(findingIds ? { findingIds, ...replyAnchor } : {}),
    },
    currentTaskId: args.taskId,
  });
  if (next === attachments) {
    return "unchanged";
  }
  const followUp = state.settings.reviewTask.followUpPrompt.trim();
  const prefill = Boolean(followUp) && !(draft?.text ?? "").trim();
  state.updatePromptDraft({
    taskId: args.taskId,
    patch: { attachments: [...next], ...(prefill ? { text: followUp } : {}) },
  });
  return prefill ? "attached-with-prompt" : "attached";
}
