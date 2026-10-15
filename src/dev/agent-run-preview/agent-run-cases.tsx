import { useLayoutEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { AgentRunInstructions } from "@/components/agent-runs/AgentRunPrompt";
import { AgentRunResultCardView } from "@/components/agent-runs/AgentRunResultCard";
import { FleetAgentRunStrip } from "@/components/agent-runs/FleetAgentRunStrip";
import { AgentRunBarView } from "@/components/agent-runs/AgentRunBar";
import { ComposerShelfSurface } from "@/components/session/composer-shelf/ComposerShelf";
import type { ShelfTurnAlert } from "@/components/session/composer-shelf/composer-shelf.utils";
import { AgentRunDetailView } from "@/components/agent-runs/AgentRunPanel";
import { compileAgentRunStagePrompt } from "@/lib/agent-runs/briefing";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { AGENT_RUN_ASSIGNMENT, buildAgentRunFixtures } from "./agent-run-fixtures";

/*
 * Agent run cases for the agent run preview: `?stavePreview=agent-run&only=agent-run`.
 * `w=384` narrows the page to the Task panel's usual width.
 */

const noop = (async () => ({ ok: true, agentRun: null })) as never;
const runActions = {
  onResume: () => {},
  onExtend: () => {},
  onStop: () => {},
  onTakeControl: () => {},
  onRetry: () => {},
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
export function agentRunFleetDetails(): Record<string, AgentRunDetail> {
  const runs = buildAgentRunFixtures(new Date(Date.now() - 4 * 60_000));
  const as = (detail: AgentRunDetail, id: string, workspaceId: string): AgentRunDetail => ({
    ...detail,
    agentRun: { ...detail.agentRun, id, workspaceId },
  });
  return {
    "fleet-agent-working": as(runs.working, "fleet-agent-working", "fleet-d"),
    "fleet-agent-needs": as(runs.blocked, "fleet-agent-needs", "fleet-e"),
    "fleet-agent-workflow": as(runs.workflow, "fleet-agent-workflow", "fleet-f"),
    "fleet-agent-event-wait": as(runs.eventWait, "fleet-agent-event-wait", "fleet-g"),
    "fleet-agent-taken-over": as(runs.takenOver, "fleet-agent-taken-over", "fleet-h"),
    "fleet-agent-usage-unknown": as(runs.usageUnknown, "fleet-agent-usage-unknown", "fleet-i"),
  };
}

/** The preview's Fleet cards: workspace, card title, and the decision its lead task holds open. */
const FLEET_CARDS = [
  ["fleet-d", "billing-overflow", null],
  ["fleet-d", "billing-overflow · a question open", "question"],
  ["fleet-e", "csv-export", null],
  ["fleet-f", "export-crash", null],
  ["fleet-g", "pr-checks", null],
  ["fleet-h", "taken-over", null],
  ["fleet-i", "usage-limit", null],
] as const;

export function AgentRunPreviewCases({ now, width }: { now: number; width: number | null }) {
  const runs = buildAgentRunFixtures(new Date(now - 23 * 60_000));
  const working = buildAgentRunFixtures(new Date(now - 4 * 60_000));
  const limitReached: AgentRunDetail = { ...working.working, agentRun: { ...working.working.agentRun, state: "paused", pauseReason: "limit-reached", turnCount: 1, maxTurns: 1 } };
  const prompt = compileAgentRunStagePrompt({ agentRun: runs.working.agentRun, stages: runs.working.stages });
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
          ["Agent run working", "Composer · Running", working.working, "Running the tests", null, null],
          ["Agent run waiting", "Composer · Running · waiting for a usage reset", working.waiting, null, null, null],
          ["Agent run event wait", "Composer · Running · waiting for PR checks", working.eventWait, null, null, null],
          ["Agent run question", "Composer · Needs your answer · question", working.working, null, null, "question"],
          ["Agent run approval", "Composer · Needs your answer · approval", working.working, null, null, "approval"],
          ["Agent run paused", "Composer · Paused", working.paused, null, null, null],
          ["Agent run taken over", "Composer · Paused · taken over", working.takenOver, null, null, null],
          ["Agent run limit reached", "Composer · Halted · Limit reached", limitReached, null, null, null],
          ["Agent run blocked", "Composer · Halted · blocked", working.blocked, null, null, null],
          ["Agent run stuck", "Composer · Halted · stuck (Retry)", working.stuck, null, null, null],
          ["Agent run usage unknown", "Composer · Halted · usage limit, reset unknown", working.usageUnknown, null, null, null],
          ["Agent run wait expired", "Composer · Halted · wait expired", working.waitExpired, null, null, null],
          ["Agent run recovery", "Composer · Halted · recovery needed", working.recovery, null, null, null],
          ["Agent run workflow", "Composer · an agent with a workflow, stage 2 of 3", working.workflow, "Reading the export handler", null, null],
          ["Agent run sign-off", "Composer · workflow, Needs your answer · sign-off", working.signOff, null, null, null],
          ["Agent run turn stalled", "Composer · working, its turn stalled", working.working, "Running the tests", STALLED_TURN, null],
          ["Agent run turn steering", "Composer · workflow, a steer in flight", working.workflow, "Reading the export handler", STEERING_TURN, null],
        ] as const
      ).map(([id, label, detail, phrase, turnAlert, decision]) => (
        <section key={id} className={sx(styles.case)} data-preview-case={id}>
          <p className={sx(styles.caption)}>{label}</p>
          <div className={sx(styles.stack)}>
            <ComposerShelfSurface>
              <AgentRunBarView
                detail={detail}
                nowPhrase={phrase}
                turnAlert={turnAlert}
                decision={decision}
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
        <p className={sx(styles.caption)}>Conversation · reason card, stopped at its turn limit</p>
        <AgentRunResultCardView detail={runs.failed} now={now} actions={runActions} />
      </section>

      {(
        [
          ["Agent run panel limit reached", "Progress tab · Halted · Limit reached", limitReached, null],
          ["Agent run panel working", "Progress tab · Running", working.working, null],
          ["Agent run panel workflow", "Progress tab · workflow, stage 2 of 3", working.workflow, null],
          ["Agent run panel waiting", "Progress tab · Running · waiting for a usage reset", working.waiting, null],
          ["Agent run panel event wait", "Progress tab · Running · waiting for PR checks", working.eventWait, null],
          ["Agent run panel approval", "Progress tab · Needs your answer · approval", working.working, "approval"],
          ["Agent run panel taken over", "Progress tab · Paused · taken over", working.takenOver, null],
          ["Agent run panel blocked", "Progress tab · Halted · blocked", working.blocked, null],
          ["Agent run panel stuck", "Progress tab · Halted · stuck (the bar has Retry)", working.stuck, null],
          ["Agent run panel ready", "Progress tab · Completed", runs.ready, null],
          ["Agent run panel failed", "Progress tab · Stopped at its turn limit", runs.failed, null],
          ["Agent run panel stopped", "Progress tab · Stopped by you", runs.stopped, null],
        ] as const
      ).map(([id, label, detail, decision]) => (
        <section key={id} className={sx(styles.case, styles.rail)} data-preview-case={id}>
          <p className={sx(styles.caption)}>{label}</p>
          <AgentRunDetailView detail={detail} now={now} onCommand={noop} agentActions={runActions} decision={decision} />
        </section>
      ))}

      <section className={sx(styles.case)} data-preview-case="Agent run fleet">
        <p className={sx(styles.caption)}>Fleet workspace cards</p>
        <div className={sx(styles.fleet)}>
          {FLEET_CARDS.map(([workspaceId, title, decision]) => (
            <div key={title} className={sx(styles.fleetCard)}>
              <div className={sx(styles.fleetHeader)}>
                <strong>{title}</strong>
                <span className={sx(styles.caption)}>acme/app</span>
              </div>
              <FleetAgentRunStrip workspaceId={workspaceId} onOpen={() => {}} leadTaskDecision={decision} />
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
