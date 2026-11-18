import { GitPullRequest, TriangleAlert } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { ExternalAnchor } from "@/components/ui/external-anchor";
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
      <div className={sx(styles.root)} data-testid="task-pr-watch-notice" data-state="ambiguous">
        <div className={sx(styles.chip)}>
          <span className={sx(styles.lead)}>
            <TriangleAlert aria-hidden className={sx(styles.icon, styles.iconPaused)} />
            <p className={sx(styles.text)}>{t("agentPrWatch.ambiguous", { number: props.hint.pullRequest.number })}</p>
          </span>
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
  const status = state === "stopped" ? t("agentPrWatch.statusStopped")
    : state === "paused" ? t("agentPrWatch.statusPaused")
      : pullRequest ? t("agentPrWatch.statusWatching")
        : t("agentPrWatch.statusWaiting");
  const iconTone = state === "stopped" ? styles.iconIdle : state === "paused" ? styles.iconPaused : styles.iconWatching;
  const label = pullRequest ? t("agentPrWatch.label", { number: pullRequest.number }) : t("agentPrWatch.labelNoPr");
  return (
    <div className={sx(styles.root)} data-testid="task-pr-watch-notice" data-state={state}>
      <div className={sx(styles.chip)}>
        <span className={sx(styles.lead)}>
          <GitPullRequest aria-hidden className={sx(styles.icon, iconTone)} />
          {pullRequest?.url
            ? <ExternalAnchor href={pullRequest.url} xstyle={styles.label} title={pullRequest.title}>{label}</ExternalAnchor>
            : <span className={sx(styles.label)}>{label}</span>}
          <span aria-hidden className={sx(styles.separator)}>·</span>
          <p className={sx(styles.text)}>{status}</p>
        </span>
        {automatic
          ? state !== "stopped" ? <Button size="xs" variant="quiet" disabled={props.busy} onClick={props.onStop}>{t("agentPrWatch.stop")}</Button> : null
          : <Button size="xs" variant="quiet" onClick={props.onOpenSchedules}>{t("agentPrWatch.openSchedules")}</Button>}
      </div>
      {props.failure ? <p role="alert" className={sx(styles.failure)}>{props.failure}</p> : null}
    </div>
  );
}
