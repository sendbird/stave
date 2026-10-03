import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { CirclePause } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import {
  AGENT_RUN_VIEW_STATE_LABELS,
  AGENT_RUN_VIEW_STATE_TONES,
  agentRunDuration,
  describeAgentRunProgress,
  agentRunFleetState,
  describeAgentRunStatus,
} from "@/lib/agent-runs/agent-run-status";
import { describeAgentRunStatusLine, projectAgentRunStages, type AgentRunStageRow } from "@/lib/agent-runs/agent-run-view";
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow } from "./useAgentRun";

/** The workspace's running agent run: the newest active one, as stored. */
function pickActiveAgentRun(details: Record<string, AgentRunDetail>, workspaceId: string) {
  let picked: AgentRunDetail | undefined;
  for (const detail of Object.values(details)) {
    if (detail.agentRun.workspaceId !== workspaceId || !isActiveAgentRunState(detail.agentRun.state)) continue;
    if (!picked || detail.agentRun.createdAt > picked.agentRun.createdAt) picked = detail;
  }
  return picked;
}

/** The workspace's running agent run for a Fleet card, as stored; undefined for none. */
export function useFleetActiveAgentRun(workspaceId: string): AgentRunDetail | undefined {
  return useFleetAgentRunsStore((state) => pickActiveAgentRun(state.details, workspaceId));
}

/**
 * A Fleet card's agent run line: the stage track and where it stands, so a board
 * of workspaces shows which agent runs wait for you without opening any. For an
 * agent run it names the agent and the state for the lead task, whose row
 * then shows neither.
 */
export function FleetAgentRunStrip(props: {
  workspaceId: string;
  onOpen: (taskId: string) => void;
  /** The lead task waits on the user (a question or an approval in its turn). */
  leadTaskWaiting?: boolean;
}) {
  const detail = useFleetActiveAgentRun(props.workspaceId);
  const rows = useMemo(() => (detail ? projectAgentRunStages(detail, new Date(detail.agentRun.updatedAt)) : []), [detail]);
  if (!detail) return null;
  if (hasAgentOrigin(detail.agentRun)) {
    return (
      <FleetAgentRunLine detail={detail} rows={rows} onOpen={props.onOpen} leadTaskWaiting={props.leadTaskWaiting ?? false} />
    );
  }
  const line = describeAgentRunStatusLine(detail);
  const paused = detail.agentRun.state === "paused";
  const spent = describeUsageShort(detail.usage);
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={`Run ${detail.agentRun.workflow.name}: ${line.title}${line.state ? `, ${line.state}` : ""}. Open the task.`}
      onClick={() => props.onOpen(detail.agentRun.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={line.tone} icon={paused ? CirclePause : undefined} />
        <span className={sx(styles.text)}>
          <span className={sx(styles.title)}>{line.title}</span>
          {line.state ?? line.detail ? (
            <span className={sx(line.tone === "attention" ? styles.attention : line.tone === "waiting" ? styles.waiting : styles.muted)}>
              {" · "}
              {line.state ?? line.detail}
            </span>
          ) : null}
        </span>
        {spent ? <span className={sx(styles.position)}>{spent}</span> : null}
      </span>
      <StageTrack rows={rows} live={false} paused={paused} />
    </Button>
  );
}

/** A Fleet card's line for an agent run: the agent and its state, and its stage track when it has stages. */
function FleetAgentRunLine(props: {
  detail: AgentRunDetail;
  rows: readonly AgentRunStageRow[];
  onOpen: (taskId: string) => void;
  leadTaskWaiting: boolean;
}) {
  const { detail, rows } = props;
  const status = describeAgentRunStatus(detail);
  const state = agentRunFleetState(status.state, props.leadTaskWaiting);
  const label = AGENT_RUN_VIEW_STATE_LABELS[state];
  const spent = describeUsageShort(detail.usage);
  const now = useNow(isActiveAgentRunState(detail.agentRun.state));
  const elapsed = agentRunDuration(detail, now);
  const staged = rows.length > 1;
  const progress = staged ? null : describeAgentRunProgress(detail);
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={`${status.agentName}: ${label}. Open the task.`}
      onClick={() => props.onOpen(detail.agentRun.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={AGENT_RUN_VIEW_STATE_TONES[state]} state={state} />
        <span className={sx(styles.text)}>
          <span className={sx(styles.title)}>{status.agentName}</span>
          <span className={sx(state === "needs-you" ? styles.waiting : styles.muted)}>
            {" · "}
            {label}
          </span>
        </span>
        <span className={sx(styles.position)}>
          {progress ? `${progress} · ` : ""}
          {elapsed}
          {spent ? ` · ${spent}` : ""}
        </span>
      </span>
      {staged ? <StageTrack rows={rows} live={false} paused={detail.agentRun.state === "paused"} /> : null}
    </Button>
  );
}

const styles = stylex.create({
  strip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--ads-space-4"],
    width: "100%",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    textAlign: "start",
    color: vars["--ads-color-text"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    cursor: "pointer",
  },
  head: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  text: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
  },
  title: { fontWeight: vars["--ads-font-weight-medium"] },
  muted: { color: vars["--ads-color-text-muted"] },
  waiting: { color: vars["--ads-color-warning-text"] },
  attention: { color: vars["--ads-color-danger-text"] },
  position: {
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
    fontVariantNumeric: "tabular-nums",
  },
});
