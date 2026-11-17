import { Eye } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { useTaskWakeUp, useWakeUpsStore, type TaskWakeUp } from "@/store/wake-ups-store";
import { taskPullRequestWatchStyles as styles } from "./task-pull-request-watch.styles";

/** The saved watch is the record: it stays visible after a restart and after it stops. */
export function TaskPullRequestWatchNotice(props: { workspaceId: string; taskId: string }) {
  const entry = useTaskWakeUp(props.workspaceId, props.taskId);
  const id = entry?.wakeUp.id ?? "";
  const busy = useWakeUpsStore((state) => Boolean(state.pendingById[id]));
  const failure = useWakeUpsStore((state) => state.failureById[id]);
  const remove = useWakeUpsStore((state) => state.remove);
  return <TaskPullRequestWatchNoticeView entry={entry} busy={busy} failure={failure} onStop={() => void remove(id)} />;
}

export function TaskPullRequestWatchNoticeView(props: {
  entry?: TaskWakeUp;
  busy?: boolean;
  failure?: string;
  onStop: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  if (props.entry?.wakeUp.trigger.kind !== "pull_request") return null;
  const state = props.entry.summary.state;
  return (
    <div className={sx(styles.root)} data-testid="task-pr-watch-notice">
      <div className={sx(styles.row)}>
        <Eye aria-hidden className={sx(styles.icon)} />
        <p className={sx(styles.text)}>
          {t(state === "stopped" ? "agentPrWatch.stopped" : state === "paused" ? "agentPrWatch.paused" : "agentPrWatch.watching")}
        </p>
        {state !== "stopped" ? <Button size="xs" variant="quiet" disabled={props.busy} onClick={props.onStop}>{t("agentPrWatch.stop")}</Button> : null}
      </div>
      {props.failure ? <p role="alert" className={sx(styles.text)}>{props.failure}</p> : null}
    </div>
  );
}
