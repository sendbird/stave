import { Eye } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import type { PullRequestAutoWatchHint } from "@/lib/supervision/wake-up-bridge";
import { useAppStore } from "@/store/app.store";
import { useTaskAutoWatchHint, useTaskWakeUp, useWakeUpsStore, type TaskWakeUp } from "@/store/wake-ups-store";
import { taskPullRequestWatchStyles as styles } from "./task-pull-request-watch.styles";

/** The saved watch is the record: it stays visible after a restart and after it stops. */
export function TaskPullRequestWatchNotice(props: { workspaceId: string; taskId: string }) {
  const entry = useTaskWakeUp(props.workspaceId, props.taskId);
  const hint = useTaskAutoWatchHint(props.workspaceId, props.taskId);
  const id = entry?.wakeUp.id ?? "";
  const busy = useWakeUpsStore((state) => Boolean(state.pendingById[id]));
  const failure = useWakeUpsStore((state) => state.failureById[id]);
  const remove = useWakeUpsStore((state) => state.remove);
  const openSchedules = useAppStore((state) => state.openAutomationCenter);
  return <TaskPullRequestWatchNoticeView entry={entry} hint={hint} busy={busy} failure={failure} onStop={() => void remove(id)} onOpenSchedules={openSchedules} />;
}

export function TaskPullRequestWatchNoticeView(props: {
  entry?: TaskWakeUp;
  hint?: PullRequestAutoWatchHint;
  busy?: boolean;
  failure?: string;
  onStop: () => void;
  onOpenSchedules: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  const watch = props.entry?.wakeUp.trigger.kind === "pull_request" ? props.entry : undefined;
  if (!watch) {
    // Another schedule on this task is not a pull request watch; say nothing about it.
    if (!props.hint || props.entry) return null;
    return (
      <div className={sx(styles.root)} data-testid="task-pr-watch-notice">
        <div className={sx(styles.row)}>
          <Eye aria-hidden className={sx(styles.icon)} />
          <p className={sx(styles.text)}>{t("agentPrWatch.ambiguous", { number: props.hint.pullRequest.number })}</p>
          <Button size="xs" variant="quiet" onClick={props.onOpenSchedules}>{t("agentPrWatch.openSchedules")}</Button>
        </div>
      </div>
    );
  }
  const state = watch.summary.state;
  const pullRequest = watch.wakeUp.pullRequestWatch?.pullRequest ?? null;
  // Only a watch Stave added on its own may be removed from here; the user's
  // own schedule is changed where it was made.
  const automatic = watch.wakeUp.pullRequestWatch?.automatic === true;
  const text = state === "stopped" ? t("agentPrWatch.stopped")
    : state === "paused" ? t("agentPrWatch.paused")
      : pullRequest ? t("agentPrWatch.watchingPr", { number: pullRequest.number })
        : t("agentPrWatch.waitingForPr");
  return (
    <div className={sx(styles.root)} data-testid="task-pr-watch-notice">
      <div className={sx(styles.row)}>
        <Eye aria-hidden className={sx(styles.icon)} />
        <p className={sx(styles.text)}>{text}</p>
        {automatic
          ? state !== "stopped" ? <Button size="xs" variant="quiet" disabled={props.busy} onClick={props.onStop}>{t("agentPrWatch.stop")}</Button> : null
          : <Button size="xs" variant="quiet" onClick={props.onOpenSchedules}>{t("agentPrWatch.openSchedules")}</Button>}
      </div>
      {props.failure ? <p role="alert" className={sx(styles.text)}>{props.failure}</p> : null}
    </div>
  );
}
