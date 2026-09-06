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
const Collaboration = lazy(() =>
  import("@/components/collaboration/CollaborationPanel").then((module) => ({
    default: module.CollaborationPanel,
  })),
);

/** Task-owned records have their own destination, separate from live turn activity. */
export function TaskWorkPanel({ kind }: { kind: "results" | "collaboration" }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useAppStore((state) => state.activeTaskId);
  const projectPath = useAppStore((state) => state.projectPath);
  const task = useAppStore((state) =>
    state.tasks.find((item) => item.id === state.activeTaskId),
  );
  if (!workspaceId || !taskId || !task) {
    return <p className={sx(styles.empty)}>Open a task to see its {kind}.</p>;
  }
  if (kind === "collaboration" && (!projectPath || isTaskManaged(task))) {
    return (
      <p className={sx(styles.empty)}>
        Collaboration is available in a local project task.
      </p>
    );
  }
  return (
    <div className={sx(styles.panel)}>
      <p className={sx(styles.title)} title={task.title}>
        {task.title}
      </p>
      <Suspense fallback={<Loader label={`Loading ${kind}…`} showLabel />}>
        {kind === "results" ? (
          <Results
            key={`${workspaceId}:${taskId}`}
            workspaceId={workspaceId}
            taskId={taskId}
          />
        ) : (
          <Collaboration
            key={`${workspaceId}:${taskId}`}
            target={{ workspaceId, taskId, projectPath: projectPath! }}
          />
        )}
      </Suspense>
    </div>
  );
}

const styles = stylex.create({
  empty: {
    padding: vars.space16,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorTextMuted,
  },
  panel: {
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
    padding: vars.space16,
  },
  title: {
    marginBottom: vars.space16,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    fontWeight: vars.fontWeightMedium,
  },
});
