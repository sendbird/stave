import * as stylex from "@stylexjs/stylex";
import { MessageSquareText } from "lucide-react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Loader } from "../ads/components/Loader";
import { lazy, Suspense } from "react";
import { isTaskManaged } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";

const Results = lazy(() =>
  import("./TaskResultReviews").then((module) => ({
    default: module.TaskResultReviews,
  })),
);
const Mission = lazy(() =>
  import("@/components/missions/MissionPanel").then((module) => ({
    default: module.MissionPanel,
  })),
);
const Team = lazy(() =>
  import("@/components/team/TeamSection").then((module) => ({
    default: module.TeamSection,
  })),
);

export type TaskWorkPanelKind = "results" | "mission" | "team";

const KIND_LABELS: Record<TaskWorkPanelKind, string> = {
  results: "results",
  mission: "mission",
  team: "team",
};

/**
 * Names the task a panel is about: a labelled header, so the title reads as
 * "this panel is for that task" rather than as a heading of its content.
 */
export function TaskWorkPanelHeader(props: { title: string }) {
  return (
    <header className={sx(styles.header)}>
      <span className={sx(styles.eyebrow)}>Task</span>
      <span className={sx(styles.titleRow)}>
        <MessageSquareText aria-hidden className={sx(styles.titleIcon)} />
        <span className={sx(styles.title)} title={props.title}>
          {props.title}
        </span>
      </span>
    </header>
  );
}

/** Task-owned records have their own destination, separate from live turn activity. */
export function TaskWorkPanel({ kind }: { kind: TaskWorkPanelKind }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useAppStore((state) => state.activeTaskId);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const task = useAppStore((state) =>
    state.tasks.find((item) => item.id === state.activeTaskId),
  );
  const kindLabel = KIND_LABELS[kind];
  if (!workspaceId || !taskId || !task) {
    return (
      <p className={sx(styles.empty)}>Open a task to see its {kindLabel}.</p>
    );
  }
  const teamAvailable = Boolean(repositoryPath) && !isTaskManaged(task);
  return (
    <div className={sx(styles.panel)}>
      <TaskWorkPanelHeader title={task.title} />
      <Suspense fallback={<Loader label={`Loading ${kindLabel}…`} showLabel />}>
        {kind === "results" ? (
          <Results
            key={`${workspaceId}:${taskId}`}
            workspaceId={workspaceId}
            taskId={taskId}
          />
        ) : kind === "mission" ? (
          <Mission
            key={`${workspaceId}:${taskId}`}
            workspaceId={workspaceId}
            taskId={taskId}
          />
        ) : teamAvailable ? (
          <Team
            key={`${workspaceId}:${taskId}`}
            target={{ workspaceId, taskId, repositoryPath: repositoryPath! }}
          />
        ) : (
          <p className={sx(styles.notice)}>
            Advisor, workers and delegated tasks are available in a local repository task.
          </p>
        )}
      </Suspense>
    </div>
  );
}

const styles = stylex.create({
  empty: {
    padding: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  panel: {
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
    padding: vars["--ads-space-16"],
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: vars["--ads-space-16"],
    paddingBottom: vars["--ads-space-12"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
    minWidth: 0,
  },
  eyebrow: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-subtle"],
  },
  titleRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  titleIcon: { width: 16, height: 16, flex: "0 0 auto", color: vars["--ads-color-text-muted"] },
  title: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
});
