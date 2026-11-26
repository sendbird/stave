import { useState } from "react";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { useTaskWakeUp } from "@/store/wake-ups-store";
import { isTaskManaged } from "@/lib/tasks";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { effectiveSetting } from "@/store/project-settings-overrides";
import { watchCreatedPullRequest } from "./auto-pull-request-watch";

const eventLabels = { checks_failed: "prFix.checksFailed", merge_conflict: "prFix.mergeConflict", review_comments: "prFix.reviewComments" } as const;

export function PullRequestWatchMenuItem({ prUrl }: { prUrl: string }) {
  const { t } = useTranslation("sourceControl");
  const workspaceId = useAppStore(s => s.activeWorkspaceId);
  const task = useAppStore(s => s.tasks.find(item => item.id === s.activeTaskId && !item.archivedAt));
  const enabled = useAppStore(s => effectiveSetting("createPrWatchEnabled", s.repositoryPath, s));
  const readOnly = useAgentAssignmentsStore(s => task && s.byTaskId[task.id]?.agentPermission === "read-only");
  const wake = useTaskWakeUp(workspaceId, task?.id ?? "")?.wakeUp;
  const [busy, setBusy] = useState(false);
  const existing = wake && wake.state !== "stopped" ? wake : null;
  const locked = existing?.pullRequestWatch?.pullRequest;
  const watch = existing?.trigger.kind === "pull_request" && (!locked || locked.url === prUrl) ? existing : null;
  const events = watch?.trigger.kind === "pull_request" ? watch.trigger.events : [];
  const comments = events.includes("review_comments");
  const reason = !task ? t("prFix.noTask") : existing && !watch ? t("prFix.otherSchedule") :
    !watch && !enabled ? t("prFix.disabled") :
    !watch && isTaskManaged(task) ? t("prFix.managed") :
    !watch && readOnly ? t("prFix.readOnly") :
    !watch && task.provider !== "claude-code" && task.provider !== "codex" ? t("prFix.unsupported") : undefined;
  async function change(editEvents: boolean) {
    if (busy || !task || reason) return;
    setBusy(true);
    try {
      const api = window.api?.wakeUps;
      if (!api) throw new Error(t("prFix.unsupported"));
      if (watch) {
        const { id, prompt, maxOccurrences, expiresAt } = watch;
        const result = editEvents ? await api.update({ id, input: { workspaceId, taskId: task.id, prompt, maxOccurrences,
          expiresAt, trigger: { kind: "pull_request", events: comments ? events.filter(event => event !== "review_comments") : [...events, "review_comments"] } } })
          : await api.remove({ id });
        if (!result.ok) throw new Error(result.message || t("prActivity.failed"));
      } else {
        const state = useAppStore.getState();
        const outcome = await watchCreatedPullRequest({ state, repositoryPath: state.repositoryPath, workspaceId, taskId: task.id });
        if (outcome.kind === "skipped") toast.warning(t(outcome.reason === "managed-task" ? "prFix.managed" : "prFix.unsupported"));
      }
    } catch (error) { toast.warning(error instanceof Error ? error.message : t("prActivity.failed")); }
    finally { setBusy(false); }
  }
  return <>
    <DropdownMenuCheckboxItem checked={!!watch} disabled={busy || !!reason} onCheckedChange={() => void change(false)}>
      {t("prFix.watch", { task: task?.title ?? "—" })}
      {reason && ` · ${reason}`}
      {watch && ` · ${events.map(event => t(eventLabels[event])).join(", ")} · ${watch.occurrenceCount}/${watch.maxOccurrences}`}
      {watch?.state === "paused" && ` · ${t("prFix.paused")}`}
    </DropdownMenuCheckboxItem>
    {watch && <DropdownMenuCheckboxItem checked={comments} disabled={busy || watch.state === "paused" || (comments && events.length === 1)}
      onCheckedChange={() => void change(true)}>{t("prFix.comments")}</DropdownMenuCheckboxItem>}
  </>;
}
