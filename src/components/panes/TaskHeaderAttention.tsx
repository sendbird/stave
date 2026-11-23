import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useTranslation } from "@/i18n";
import { deriveTaskHeaderAttention } from "@/lib/attention/task-header-attention";
import type { TaskAttentionState } from "@/lib/attention/derive-task-attention";
import { collectFleetLiveAttentionItems } from "@/lib/fleet/attention-projection";
import { activeAgentRunAttentionKind, isSupervisedTaskTurn } from "@/lib/fleet/agent-run-attention";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useTaskAgentRun } from "@/store/agent-runs-store";

const presentation = {
  "needs-you": { key: "taskAttention.needsYou", tone: "warning" },
  problem: { key: "taskAttention.problem", tone: "danger" },
  working: { key: "taskAttention.working", tone: "info" },
  "done-unseen": { key: "taskAttention.doneUnseen", tone: "success" },
  idle: { key: "taskAttention.idle", tone: "neutral" },
} as const satisfies Record<TaskAttentionState, { key: string; tone: BadgeTone }>;

export function TaskHeaderAttention({ taskId }: { taskId: string }) {
  const { t } = useTranslation("panes");
  const [workspaceId, task, messages, activeTurnId, activity, repositoryPath, notifications] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId, state.tasks.find((entry) => entry.id === taskId), state.messagesByTask[taskId],
    state.activeTurnIdsByTask[taskId], state.providerTurnActivityByTask[taskId], state.repositoryPath, state.notifications,
  ] as const));
  const fleetItems = useFleetAttention((snapshot) => snapshot.items);
  const agentRun = useTaskAgentRun(workspaceId, taskId);
  const liveItems = useMemo(() => {
    if (!task) return [];
    const rows = collectFleetLiveAttentionItems([{
      repositoryPath: repositoryPath ?? "", repositoryName: "", workspaceId, workspaceName: "",
      tasks: [task], messagesByTask: { [taskId]: messages ?? [] },
      activeTurnIdsByTask: { [taskId]: activeTurnId }, providerTurnActivityByTask: { [taskId]: activity },
    }]);
    return rows.filter((item) => item.kind !== "run-failed" || !item.turnId || !agentRun || !isSupervisedTaskTurn(agentRun, taskId, item.turnId));
  }, [task, taskId, messages, activity, activeTurnId, repositoryPath, workspaceId, agentRun]);
  const { attention, target } = useMemo(() => deriveTaskHeaderAttention({
    taskId, workspaceId, activeTurnId, liveItems, fleetItems, notifications,
    agentRunWorking: agentRun?.agentRun.state === "running" && !activeAgentRunAttentionKind(agentRun),
  }), [taskId, workspaceId, activeTurnId, liveItems, fleetItems, notifications, agentRun]);
  const { key, tone } = presentation[attention.state];
  const label = t(key);
  if (!task) return null;
  return target ? (
    <Button
      type="button"
      size="2xs"
      variant="soft"
      tone={attention.state === "problem" ? "danger" : "warning"}
      xstyle={styles.indicator}
      data-testid="task-header-attention"
      onClick={() => void useAppStore.getState().focusTaskAttention({ taskId, workspaceId, target })}
    >
      {label}
    </Button>
  ) : (
    <Badge size="sm" tone={tone} xstyle={styles.indicator} data-testid="task-header-attention">
      {label}
    </Badge>
  );
}

const styles = stylex.create({
  indicator: {
    flexShrink: 0,
    minWidth: 0,
    paddingInline: vars["--aui-space-4"],
    whiteSpace: "nowrap",
  },
});
