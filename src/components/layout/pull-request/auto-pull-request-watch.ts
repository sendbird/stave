/**
 * Watches the pull request the Create PR flow just opened.
 *
 * Used by: `src/components/layout/TopBarOpenPR.tsx`, after `gh pr create`
 * succeeds — including when only queuing auto-merge failed, because Stave
 * still opened that pull request. The watch is a `pull_request` wake-up on the task the user created
 * the pull request from, with `checks_failed` and `merge_conflict` only:
 * acting on review comments stays opt-in per task, from Schedules or the MCP
 * tool. **Settings → Prompts → PR Completion** turns it off.
 *
 * A task has one wake-up. An existing pull request watch is left as it is,
 * and a different schedule is never replaced behind the user's back — the
 * toast says so instead.
 */
import { toast } from "@/components/ui";
import { i18n } from "@/i18n";
import {
  AUTO_PULL_REQUEST_WATCH_EVENTS,
  DEFAULT_PULL_REQUEST_WATCH_PROMPT,
} from "@/lib/supervision/pull-request-watch";
import type { WakeUpsBridgeApi } from "@/lib/supervision/wake-up-bridge";
import { isTaskManaged } from "@/lib/tasks";
import type { Task } from "@/types/chat";

export type AutoPullRequestWatchOutcome =
  | { kind: "disabled" }
  | { kind: "skipped"; reason: "no-task" | "unsupported-provider" | "managed-task" | "bridge-unavailable" }
  | { kind: "already-watching"; wakeUpId: string }
  | { kind: "task-has-schedule"; wakeUpId: string }
  | { kind: "created"; wakeUpId: string }
  | { kind: "failed"; message: string };

type WatchTask = Pick<Task, "id" | "title" | "provider" | "archivedAt" | "controlMode">;

/** The decision and the write, without any toast. */
export async function ensureCreatedPullRequestWatch(args: {
  enabled: boolean;
  workspaceId: string;
  task: WatchTask | null;
  api: Pick<WakeUpsBridgeApi, "list" | "create"> | null | undefined;
}): Promise<AutoPullRequestWatchOutcome> {
  if (!args.enabled) return { kind: "disabled" };
  const task = args.task;
  if (!task || task.archivedAt) return { kind: "skipped", reason: "no-task" };
  // Wake-ups run Claude and Codex tasks; for anything else this is not offered.
  if (task.provider !== "claude-code" && task.provider !== "codex") {
    return { kind: "skipped", reason: "unsupported-provider" };
  }
  if (isTaskManaged(task)) return { kind: "skipped", reason: "managed-task" };
  const api = args.api;
  if (!api) return { kind: "skipped", reason: "bridge-unavailable" };

  try {
    const listed = await api.list({ workspaceId: args.workspaceId });
    if (!listed.ok) {
      return { kind: "failed", message: listed.message ?? i18n.t("sourceControl:pullRequestWatch.failedFallback") };
    }
    const existing = listed.wakeUps.find(
      (wakeUp) => wakeUp.taskId === task.id && wakeUp.state !== "stopped",
    );
    if (existing) {
      return existing.trigger.kind === "pull_request"
        ? { kind: "already-watching", wakeUpId: existing.id }
        : { kind: "task-has-schedule", wakeUpId: existing.id };
    }
    const created = await api.create({
      workspaceId: args.workspaceId,
      taskId: task.id,
      prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT,
      trigger: { kind: "pull_request", events: [...AUTO_PULL_REQUEST_WATCH_EVENTS] },
      // The default cap applies: a fix that keeps failing must not loop forever.
      maxOccurrences: null,
      expiresAt: null,
    });
    return created.ok && created.wakeUp
      ? { kind: "created", wakeUpId: created.wakeUp.id }
      : { kind: "failed", message: created.message ?? i18n.t("sourceControl:pullRequestWatch.failedFallback") };
  } catch (error) {
    return {
      kind: "failed",
      message: error instanceof Error && error.message ? error.message : i18n.t("sourceControl:pullRequestWatch.failedFallback"),
    };
  }
}

/** Tells the user what happened, so a watch never starts waking a task unannounced. */
export function announceCreatedPullRequestWatch(outcome: AutoPullRequestWatchOutcome, taskTitle: string) {
  switch (outcome.kind) {
    case "created":
      toast.info(i18n.t("sourceControl:pullRequestWatch.createdTitle"), {
        description: i18n.t("sourceControl:pullRequestWatch.createdDescription", { task: taskTitle }),
      });
      return;
    case "task-has-schedule":
      toast.info(i18n.t("sourceControl:pullRequestWatch.taskHasScheduleTitle"), {
        description: i18n.t("sourceControl:pullRequestWatch.taskHasScheduleDescription", { task: taskTitle }),
      });
      return;
    case "failed":
      toast.warning(i18n.t("sourceControl:pullRequestWatch.failedTitle"), { description: outcome.message });
      return;
    case "disabled":
    case "skipped":
    case "already-watching":
      return;
    default:
      outcome satisfies never;
  }
}

/** The Create PR flow's one call: read the setting and the task, watch, announce. */
export async function watchCreatedPullRequest(args: {
  state: { settings: { createPrWatchEnabled: boolean }; tasks: readonly WatchTask[] };
  workspaceId: string;
  taskId: string | null;
}) {
  const task = args.taskId ? (args.state.tasks.find((candidate) => candidate.id === args.taskId) ?? null) : null;
  const outcome = await ensureCreatedPullRequestWatch({
    enabled: args.state.settings.createPrWatchEnabled,
    workspaceId: args.workspaceId,
    task,
    api: typeof window === "undefined" ? null : window.api?.wakeUps,
  });
  if (task) announceCreatedPullRequestWatch(outcome, task.title);
  return outcome;
}
