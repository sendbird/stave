import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AGENT_RUN_STATE_TONES, describeAgentRunResult, type AgentRunResult } from "@/lib/missions/agent-run-view";
import { isAgentRun } from "@/lib/missions/agent-run";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import { useAppStore } from "@/store/app.store";
import { useTaskMission } from "@/store/missions-store";
import { AgentRunDoneWhen } from "./AgentRunDoneWhen";
import { StageStatusIcon } from "./StageStatusIcon";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { useNow } from "./useMission";
import { agentRunStyles as styles } from "./agent-run.styles";
import { missionStyles } from "./missions.styles";

function pluralFiles(count: number) {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

/** What a ready run produced: the changes, the pull request, the summary, and what to do next. */
export function AgentRunOutcome(props: { result: AgentRunResult; actions?: AgentRunActions }) {
  const { result, actions = {} } = props;
  return (
    <>
      {result.changes || result.pullRequest ? (
        <p className={sx(styles.facts)}>
          {result.changes ? (
            <span>
              {pluralFiles(result.changes.files)}{" "}
              <span className={sx(missionStyles.added)}>+{result.changes.insertions}</span>{" "}
              <span className={sx(missionStyles.removed)}>−{result.changes.deletions}</span>
            </span>
          ) : null}
          {result.pullRequest ? <span>PR #{result.pullRequest.number}</span> : null}
        </p>
      ) : null}
      {result.summary ? <p className={sx(styles.summary)}>{result.summary}</p> : null}
      <div className={sx(styles.actions)}>
        {actions.onAskForChanges ? (
          <Button size="xs" variant="secondary" onClick={actions.onAskForChanges}>
            Ask for changes
          </Button>
        ) : null}
        {result.pullRequest && actions.onOpenPullRequest ? (
          <Button size="xs" variant="secondary" onClick={() => actions.onOpenPullRequest!(result.pullRequest!.url)}>
            Open PR
            <ArrowUpRight aria-hidden />
          </Button>
        ) : null}
      </div>
    </>
  );
}

/**
 * What an agent run leaves in the conversation. Ready: Done when with what
 * backs each line, the changes, the summary, and what to do next. Failed or
 * stuck: the reason, with Retry and Take control. Renders nothing for a run
 * that is working, was stopped by the user, or is not an agent run.
 */
export function AgentRunResultCardView(props: { detail: MissionDetail; now: number; actions?: AgentRunActions }) {
  const { detail, actions = {} } = props;
  const result = describeAgentRunResult(detail, props.now);
  const { status } = result;
  const ready = status.state === "ready";
  if (!ready && !status.recovery) return null;
  const meta = [status.agentName, ready ? result.duration : null].filter(Boolean).join(" · ");
  return (
    <section
      className={sx(styles.card)}
      aria-label={`${status.label}: ${status.agentName}`}
      data-testid={ready ? "agent-run-result" : "agent-run-reason"}
    >
      <div className={sx(styles.header)}>
        <StageStatusIcon tone={AGENT_RUN_STATE_TONES[status.state]} />
        <p className={sx(styles.headline)}>
          <span className={sx(styles.headlineState)}>{status.label}</span>
          <span className={sx(styles.headlineMeta)}>{` · ${meta}`}</span>
        </p>
      </div>
      {ready ? (
        <>
          <div className={sx(styles.group)}>
            <p className={sx(missionStyles.groupLabel)}>Done when</p>
            <AgentRunDoneWhen lines={result.doneWhen} staveChecks={result.staveChecks} />
          </div>
          <AgentRunOutcome result={result} actions={actions} />
        </>
      ) : (
        <>
          {status.reason ? <p className={sx(styles.reason)}>{status.reason}</p> : null}
          <div className={sx(styles.actions)}>
            {actions.onRetry ? (
              <Button size="xs" variant="secondary" disabled={actions.busy} onClick={actions.onRetry}>
                Retry
              </Button>
            ) : null}
            {actions.onTakeControl ? (
              <Button size="xs" variant="quiet" disabled={actions.busy} onClick={actions.onTakeControl}>
                Take control
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/** The card for the scoped task, at the end of its conversation. */
export function AgentRunResultCard(props: { taskId: string }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const detail = useTaskMission(workspaceId, props.taskId);
  // A message that started after the run ended makes the card history.
  const lastStartedAt = useAppStore((state) => {
    const messages = state.messagesByTask[props.taskId];
    return messages?.[messages.length - 1]?.startedAt ?? null;
  });
  const actions = useAgentRunActions(detail);
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  const now = useNow(active);
  if (!detail || !isAgentRun(detail.mission)) return null;
  if (!active && lastStartedAt && Date.parse(lastStartedAt) > Date.parse(detail.mission.updatedAt)) return null;
  return <AgentRunResultCardView detail={detail} now={now} actions={actions} />;
}
