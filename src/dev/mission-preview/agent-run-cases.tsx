import { useLayoutEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { AgentRunInstructions } from "@/components/missions/AgentRunPrompt";
import { AgentRunResultCardView } from "@/components/missions/AgentRunResultCard";
import { FleetMissionStrip } from "@/components/missions/FleetMissionStrip";
import { MissionBarView } from "@/components/missions/MissionBar";
import { ComposerShelfSurface } from "@/components/session/composer-shelf/ComposerShelf";
import type { ShelfTurnAlert } from "@/components/session/composer-shelf/composer-shelf.utils";
import { MissionDetailView } from "@/components/missions/MissionPanel";
import { compileMissionStagePrompt } from "@/lib/missions/briefing";
import type { MissionDetail } from "@/lib/missions/api";
import { AGENT_RUN_ASSIGNMENT, buildAgentRunFixtures } from "./agent-run-fixtures";

/*
 * Agent run cases for the mission preview: `?stavePreview=mission&only=agent-run`.
 * `w=384` narrows the page to the Task panel's usual width.
 */

const noop = (async () => ({ ok: true, mission: null })) as never;
const runActions = {
  onStop: () => {},
  onTakeControl: () => {},
  onRetry: () => {},
  onAskForChanges: () => {},
  onOpenPullRequest: () => {},
};

/** A run's turn in the tones only the turn knows, as the shelf hands them to the line. */
const STALLED_TURN: ShelfTurnAlert = {
  tone: "stalled",
  label: "Stalled",
  text: "No updates for 2m 14s",
  detail: "Esc stops it, or send a message to interrupt and continue",
};
const STEERING_TURN: ShelfTurnAlert = {
  tone: "steering",
  label: "Steering",
  text: "Waiting for the provider to accept your message",
  detail: null,
};

/** Fleet cards for two runs in other workspaces; the page seeds them with its own. */
export function agentRunFleetDetails(): Record<string, MissionDetail> {
  const runs = buildAgentRunFixtures(new Date(Date.now() - 4 * 60_000));
  const as = (detail: MissionDetail, id: string, workspaceId: string): MissionDetail => ({
    ...detail,
    mission: { ...detail.mission, id, workspaceId },
  });
  return {
    "fleet-agent-working": as(runs.working, "fleet-agent-working", "fleet-d"),
    "fleet-agent-needs": as(runs.needsYou, "fleet-agent-needs", "fleet-e"),
    "fleet-agent-workflow": as(runs.workflow, "fleet-agent-workflow", "fleet-f"),
  };
}

export function AgentRunPreviewCases({ now, width }: { now: number; width: number | null }) {
  const runs = buildAgentRunFixtures(new Date(now - 23 * 60_000));
  const working = buildAgentRunFixtures(new Date(now - 4 * 60_000));
  const prompt = compileMissionStagePrompt({ mission: runs.working.mission, stages: runs.working.stages });
  return (
    <div className={sx(styles.cases)} style={width ? { maxWidth: width } : undefined}>
      <section className={sx(styles.case)} data-preview-case="Agent run bubble">
        <p className={sx(styles.caption)}>Conversation · the user's bubble for a run, instructions folded</p>
        <Message from="user">
          <div className={sx(styles.shellUser)}>
            <MessageContent>
              <span>{AGENT_RUN_ASSIGNMENT}</span>
              <AgentRunInstructions text={prompt} />
            </MessageContent>
          </div>
        </Message>
      </section>

      {(
        [
          ["Agent run working", "Composer · working", working.working, "Running the tests", null],
          ["Agent run needs you", "Composer · needs you (blocked)", working.needsYou, null, null],
          ["Agent run stuck", "Composer · needs you (stuck)", working.stuck, null, null],
          ["Agent run workflow", "Composer · an agent with a workflow, stage 2 of 3", working.workflow, "Reading the export handler", null],
          ["Agent run turn stalled", "Composer · working, its turn stalled", working.working, "Running the tests", STALLED_TURN],
          ["Agent run turn steering", "Composer · workflow, a steer in flight", working.workflow, "Reading the export handler", STEERING_TURN],
        ] as const
      ).map(([id, label, detail, phrase, turnAlert]) => (
        <section key={id} className={sx(styles.case)} data-preview-case={id}>
          <p className={sx(styles.caption)}>{label}</p>
          <div className={sx(styles.stack)}>
            <ComposerShelfSurface>
              <MissionBarView
                detail={detail}
                nowPhrase={phrase}
                turnAlert={turnAlert}
                now={now}
                reducedMotion={false}
                agentActions={runActions}
                actions={{ onOpenPanel: () => {} }}
              />
            </ComposerShelfSurface>
            <div className={sx(styles.composer)}>Tell the agent something…</div>
          </div>
        </section>
      ))}

      <section className={sx(styles.case)} data-preview-case="Agent run result">
        <p className={sx(styles.caption)}>Conversation · Result card, ready</p>
        <AgentRunResultCardView detail={runs.ready} now={now} actions={runActions} />
      </section>
      <section className={sx(styles.case)} data-preview-case="Agent run failed">
        <p className={sx(styles.caption)}>Conversation · reason card, failed</p>
        <AgentRunResultCardView detail={runs.failed} now={now} actions={runActions} />
      </section>

      {(
        [
          ["Agent run panel working", "Progress tab · working", working.working],
          ["Agent run panel workflow", "Progress tab · workflow, stage 2 of 3", working.workflow],
          ["Agent run panel needs you", "Progress tab · needs you", working.needsYou],
          ["Agent run panel stuck", "Progress tab · stuck (the bar has Retry)", working.stuck],
          ["Agent run panel ready", "Progress tab · ready", runs.ready],
          ["Agent run panel failed", "Progress tab · failed", runs.failed],
        ] as const
      ).map(([id, label, detail]) => (
        <section key={id} className={sx(styles.case, styles.rail)} data-preview-case={id}>
          <p className={sx(styles.caption)}>{label}</p>
          <MissionDetailView detail={detail} now={now} onCommand={noop} agentActions={runActions} />
        </section>
      ))}

      <section className={sx(styles.case)} data-preview-case="Agent run fleet">
        <p className={sx(styles.caption)}>Fleet workspace cards</p>
        <div className={sx(styles.fleet)}>
          {(["fleet-d", "fleet-e", "fleet-f"] as const).map((workspaceId, index) => (
            <div key={workspaceId} className={sx(styles.fleetCard)}>
              <div className={sx(styles.fleetHeader)}>
                <strong>{["billing-overflow", "csv-export", "export-crash"][index]}</strong>
                <span className={sx(styles.caption)}>acme/app</span>
              </div>
              <FleetMissionStrip workspaceId={workspaceId} onOpen={() => {}} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles = stylex.create({
  cases: { display: "flex", flexDirection: "column", gap: vars["--ads-space-32"], minWidth: 0 },
  case: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  caption: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  stack: { display: "flex", flexDirection: "column" },
  shellUser: { minWidth: 0, maxWidth: "88%", width: "fit-content" },
  composer: {
    position: "relative",
    zIndex: 10,
    minHeight: 72,
    padding: vars["--ads-space-12"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: "0.75rem",
    backgroundColor: vars["--ads-color-surface-raised"],
    color: vars["--ads-color-text-placeholder"],
    fontSize: vars["--ads-font-size-body"],
    boxShadow: vars["--ads-elevation-raised"],
  },
  rail: {
    padding: vars["--ads-space-16"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
  },
  fleet: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: vars["--ads-space-12"] },
  fleetCard: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
    overflow: "hidden",
  },
  fleetHeader: { display: "flex", flexDirection: "column", gap: 2, padding: vars["--ads-space-12"], fontSize: vars["--ads-font-size-body"] },
});
