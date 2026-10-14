import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import {
  agentRunDuration,
  describeAgentRunStatus,
  formatAgentRunBadge,
  type AgentRunDecision,
  type AgentRunStatus,
} from "@/lib/agent-runs/agent-run-status";
import { describeAgentRunStatusLine, projectAgentRunStages, type AgentRunStageRow } from "@/lib/agent-runs/agent-run-view";
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow } from "./useAgentRun";
import { useAgentRunProgress } from "./useAgentRunProgress";
import { describeRunPlan } from "@/lib/agent-runs/progress";

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

/** Needs your answer and Halted wait on the user, in the warning ink. */
function badgeInk(status: AgentRunStatus) {
  return status.badge === "needs-answer" || status.badge === "halted" ? styles.waiting : styles.muted;
}

/**
 * A Fleet card's agent run line: the stage track and the run's badge, so a
 * board of workspaces shows which agent runs wait for you without opening
 * any. For an agent run it names the agent and the badge for the lead task,
 * whose row then shows neither.
 */
export function FleetAgentRunStrip(props: {
  workspaceId: string;
  onOpen: (taskId: string) => void;
  /** The question or approval card the lead task holds open. */
  leadTaskDecision?: AgentRunDecision | null;
}) {
  useTranslation();
  const detail = useFleetActiveAgentRun(props.workspaceId);
  if (!detail) return null;
  return <FleetAgentRunStripView detail={detail} onOpen={props.onOpen} leadTaskDecision={props.leadTaskDecision} />;
}

/** The strip for one stored run, free of the store so a test can render it. */
export function FleetAgentRunStripView(props: {
  detail: AgentRunDetail;
  onOpen: (taskId: string) => void;
  leadTaskDecision?: AgentRunDecision | null;
}) {
  useTranslation();
  const { detail } = props;
  const rows = useMemo(() => projectAgentRunStages(detail, new Date(detail.agentRun.updatedAt)), [detail, i18n.language]);
  const status = describeAgentRunStatus(detail, props.leadTaskDecision ?? null);
  if (hasAgentOrigin(detail.agentRun)) {
    return <FleetAgentRunLine detail={detail} rows={rows} onOpen={props.onOpen} status={status} />;
  }
  const line = describeAgentRunStatusLine(detail);
  const badgeText = formatAgentRunBadge(status);
  const paused = detail.agentRun.state === "paused";
  const spent = describeUsageShort(detail.usage);
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={i18n.t("agentRuns:fleetAgentRunStrip.ariaLabel", { value1: detail.agentRun.workflow.name, value2: line.title, value3: `, ${badgeText}` })}
      data-badge={status.badge}
      onClick={() => props.onOpen(detail.agentRun.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={status.mark.tone} state={status.mark.state} />
        <span className={sx(styles.text)}>
          <span className={sx(styles.title)}>{line.title}</span>
          <span className={sx(badgeInk(status))}>
            {" · "}
            {badgeText}
          </span>
        </span>
        {spent ? <span className={sx(styles.position)}>{spent}</span> : null}
      </span>
      <StageTrack rows={rows} live={false} paused={paused} />
    </Button>
  );
}

/** A Fleet card's line for an agent run: the agent and its badge, and its stage track when it has stages. */
function FleetAgentRunLine(props: {
  detail: AgentRunDetail;
  rows: readonly AgentRunStageRow[];
  onOpen: (taskId: string) => void;
  status: AgentRunStatus;
}) {
  useTranslation();
  const { detail, rows, status } = props;
  const label = formatAgentRunBadge(status);
  const spent = describeUsageShort(detail.usage);
  const now = useNow(isActiveAgentRunState(detail.agentRun.state));
  const elapsed = agentRunDuration(detail, now);
  const staged = rows.length > 1;
  const plan = useAgentRunProgress(detail);
  const progress = staged ? null : describeRunPlan(plan);
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={i18n.t("agentRuns:fleetAgentRunStrip.ariaLabel2", { value1: status.agentName, value2: label })}
      data-badge={status.badge}
      onClick={() => props.onOpen(detail.agentRun.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={status.mark.tone} state={status.mark.state} />
        <span className={sx(styles.text)} title={progress ?? undefined}>
          <span className={sx(styles.title)}>{status.agentName}</span>
          <span className={sx(badgeInk(status))}>
            {" · "}
            {label}
            {progress ? ` · ${progress}` : ""}
          </span>
        </span>
        <span className={sx(styles.position)}>
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
  position: {
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
    fontVariantNumeric: "tabular-nums",
  },
});
