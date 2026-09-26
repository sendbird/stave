import * as stylex from "@stylexjs/stylex";
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

/** Task-owned records have their own destination, separate from live turn activity. */
export function TaskWorkPanel({ kind }: { kind: "results" | "mission" }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useAppStore((state) => state.activeTaskId);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const task = useAppStore((state) =>
    state.tasks.find((item) => item.id === state.activeTaskId),
  );
  const kindLabel = kind === "mission" ? "mission" : kind;
  if (!workspaceId || !taskId || !task) {
    return (
      <p className={sx(styles.empty)}>Open a task to see its {kindLabel}.</p>
    );
  }
  const teamAvailable = Boolean(repositoryPath) && !isTaskManaged(task);
  return (
    <div className={sx(styles.panel)}>
      <p className={sx(styles.title)} title={task.title}>
        {task.title}
      </p>
      <Suspense fallback={<Loader label={`Loading ${kindLabel}…`} showLabel />}>
        {kind === "results" ? (
          <Results
            key={`${workspaceId}:${taskId}`}
            workspaceId={workspaceId}
            taskId={taskId}
          />
        ) : (
          <Mission
            key={`${workspaceId}:${taskId}`}
            workspaceId={workspaceId}
            taskId={taskId}
            team={teamAvailable ? { workspaceId, taskId, repositoryPath: repositoryPath! } : null}
            teamUnavailableReason="Delegations are available in a local repository task."
          />
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
  title: {
    marginBottom: vars["--ads-space-16"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
});
