import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { localStack } from "@/lib/ui-layers.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { AgentRunBubbleFrame, AgentRunPromptRow } from "@/components/agent-runs/AgentRunPrompt";
import { AgentRunResultCardView } from "@/components/agent-runs/AgentRunResultCard";
import { FleetAgentRunStrip } from "@/components/agent-runs/FleetAgentRunStrip";
import { AgentRunBarView } from "@/components/agent-runs/AgentRunBar";
import { ComposerShelfSurface } from "@/components/session/composer-shelf/ComposerShelf";
import type { ShelfTurnAlert } from "@/components/session/composer-shelf/composer-shelf.utils";
import { AgentRunDetailView } from "@/components/agent-runs/AgentRunPanel";
import { buildStageNudgePrompt, compileAgentRunStagePrompt } from "@/lib/agent-runs/briefing";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
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

/** A delegate on the run's shelf line, in the state the case needs. */
function previewDelegate(id: string, title: string, outcome: DelegationExchange["outcome"], endedAt?: number): DelegationExchange {
  return {
    id, kind: "delegated-task", title, identity: { role: "Agent", providerId: "codex" }, ask: "Review the diff",
    outcome, timing: { startedAt: null, stages: [], ...(endedAt ? { endedAt } : {}) }, actions: [], setup: {}, ref: { delegationKey: id },
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
  // Waiting on a delegated task, named by the saved Agent it runs as (recorded on the registration event).
  const delegatedWaitBase = working.eventWait.agentRun.eventWait!;
  const delegatedWait: AgentRunDetail = { ...working.eventWait,
    agentRun: { ...working.eventWait.agentRun, eventWait: { ...delegatedWaitBase, kind: "delegated_completion", target: "2c21e993-5d2c-4c5b-9a55-0c6a8e1f4b7d" } },
    events: [...working.eventWait.events, { id: "wait-registered-preview", agentRunId: working.eventWait.agentRun.id, sequence: 999, kind: "wait-registered",
      idempotencyKey: null, createdAt: delegatedWaitBase.registeredAt,
      detail: { waitId: delegatedWaitBase.id, waitKind: "delegated_completion", target: "2c21e993-5d2c-4c5b-9a55-0c6a8e1f4b7d", targetLabel: "Reviewer" } }] };
  // A PR wait whose watch read the pull request a minute ago, and one whose reads fail.
  const prWaitBase = working.eventWait.agentRun.eventWait!;
  const prWatch = { pullRequest: null, lastCheckedAt: new Date(now - 90_000).toISOString(), lastSeen: null, consecutiveReadFailures: 0, lastReadError: null, pendingSince: null };
  const prWaitChecked: AgentRunDetail = { ...working.eventWait, agentRun: { ...working.eventWait.agentRun, eventWait: { ...prWaitBase, watch: prWatch } } };
  const prWaitFailing: AgentRunDetail = { ...working.eventWait, agentRun: { ...working.eventWait.agentRun, eventWait: { ...prWaitBase, watch: { ...prWatch, consecutiveReadFailures: 3, lastReadError: "gh: timeout" } } } };
  const observed = { eventWaitObservedAt: new Date(now - 4_000).toISOString() };
  const delegatedWatched: AgentRunDetail = { ...delegatedWait, ...observed };
  const delegatedStale: AgentRunDetail = { ...delegatedWait, eventWaitObservedAt: new Date(now - 6 * 60_000).toISOString() };
  const untargetedWait: AgentRunDetail = { ...delegatedWatched, agentRun: { ...delegatedWait.agentRun, eventWait: { ...delegatedWait.agentRun.eventWait!, target: null, since: new Date(now - 30 * 60_000).toISOString(), waitingSince: new Date(now - 10 * 60_000).toISOString() } } };
  const delegatesWorking = [
    previewDelegate("review", "Reviewer", { status: "running", progress: ["Reading the diff", "Running bun test tests/agent-run-ui.test.tsx"] }),
    previewDelegate("docs", "Writer", { status: "queued" }),
    previewDelegate("lint", "Linter", { status: "returned", result: "Clean." }),
    previewDelegate("perf", "Profiler", { status: "returned", result: "No regressions." }),
  ];
  const delegatesNeedYou = [
    previewDelegate("review", "Reviewer", { status: "returned", progress: ["Reading the diff"], result: "No findings." }),
    previewDelegate("docs", "Writer", { status: "running", needsUser: true, progress: ["Waiting for an approval"] }),
    previewDelegate("ship", "Shipper", { status: "running", waiting: true }),
  ];
  const delegatesFinished = [
    previewDelegate("review", "Reviewer", { status: "returned", result: "No findings." }, now - 3 * 60_000),
  ];
  // The ledger row behind it, undelivered: the host should have woken the run on it.
  const leadTaskId = delegatedWait.agentRun.leadTaskId;
  const finishedChildren = [{
    runId: `child-task:${leadTaskId}:review`, stepId: `child-task:${leadTaskId}:review:turn`, parentTaskId: leadTaskId,
    delegationKey: "review", delegatedTaskId: "task-review", delegatedWorkspaceId: "ws-preview", delegatedTurnId: null,
    providerId: "codex", lifecycle: "one-turn", phase: "completed",
    reason: null, attempt: 0, createdAt: new Date(now - 20 * 60_000).toISOString(),
    updatedAt: new Date(now - 3 * 60_000).toISOString(), completedAt: new Date(now - 3 * 60_000).toISOString(),
  } as DelegatedTaskSummary];
  // An Extended run: 40 shared turns, one helper Agent still working.
  const teamLimits: AgentRunDetail = { ...working.working, resources: { rootRunId: working.working.agentRun.id, teamTurns: 40,
    policy: { version: 2, profile: "balanced", providerId: "claude-code", allowedModels: ["claude-opus-5-5", "claude-sonnet-5-5"],
      modelLocked: false, effortLocked: false, initialEffort: "high", teamTurns: 30, concurrentHelpers: 3, totalHelpers: 8,
      parentReserve: 1, maxChanges: 2, cooldownTurns: 2 },
    spent: 12, reserved: 9, remaining: 19, helpersLaunched: 2, activeHelpers: 1, reservations: [] } };
  const prompt = compileAgentRunStagePrompt({ agentRun: runs.working.agentRun, stages: runs.working.stages });
  const nudge = buildStageNudgePrompt({ agentRun: runs.working.agentRun, stages: runs.working.stages });
  return (
    <div className={sx(styles.cases)} style={width ? { maxWidth: width } : undefined}>
      <section className={sx(styles.case)} data-preview-case="Agent run bubble">
        <p className={sx(styles.caption)}>Conversation · a run's first prompt: the bubble holds only the user's words; the full prompt Stave built folds in a row below</p>
        <Message from="user">
          <div className={sx(styles.shellUser)}>
            <AgentRunBubbleFrame framed>
              <MessageContent>
                <span>{AGENT_RUN_ASSIGNMENT}</span>
              </MessageContent>
            </AgentRunBubbleFrame>
            <AgentRunPromptRow text={prompt} kind="assignment" />
          </div>
        </Message>
      </section>

      <section className={sx(styles.case)} data-preview-case="Agent run follow-up">
        <p className={sx(styles.caption)}>Conversation · a run prompt with no words of the user's (the reminder to report): no bubble, only the row</p>
        <Message from="user">
          <div className={sx(styles.shellUser)}>
            <AgentRunPromptRow text={nudge} kind="followUp" />
          </div>
        </Message>
      </section>

      <section className={sx(styles.case)} data-preview-case="Agent run pending bubble">
        <p className={sx(styles.caption)}>Conversation · a send waiting on its run: the assignment, the prompt still being prepared</p>
        <Message from="user">
          <div className={sx(styles.shellUser)}>
            <AgentRunBubbleFrame framed>
              <MessageContent>
                <span>{AGENT_RUN_ASSIGNMENT}</span>
              </MessageContent>
            </AgentRunBubbleFrame>
            <AgentRunPromptRow text={null} kind="assignment" />
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

      {(
        [
          ["Agent run delegated wait", "Composer · waiting for delegated work, one working, one queued, two done (folded)", delegatedWatched, delegatesWorking, null],
          ["Agent run delegated wait needs you", "Composer · a delegate needs you (lifted onto the run line), one waiting on its own", delegatedWatched, delegatesNeedYou, null],
          ["Agent run delegated wait finished", "Composer · delegated work finished 3m ago, the run has not resumed", untargetedWait, delegatesFinished, finishedChildren],
          ["Agent run delegated wait stale", "Composer · the host has not looked at the wait for 6m", delegatedStale, delegatesWorking, null],
          ["Agent run PR wait checked", "Composer · waiting for PR checks, read 1m ago", prWaitChecked, null, null],
          ["Agent run PR wait failing", "Composer · waiting for PR checks, reads failing", prWaitFailing, null, null],
        ] as const
      ).map(([id, label, detail, subagents, children]) => (
        <section key={id} className={sx(styles.case)} data-preview-case={id}>
          <p className={sx(styles.caption)}>{label}</p>
          <div className={sx(styles.stack)}>
            <ComposerShelfSurface>
              <AgentRunBarView
                detail={detail}
                nowPhrase={null}
                subagents={subagents}
                delegatedChildren={children}
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
      <section className={sx(styles.case)} data-preview-case="Agent run result checks">
        <p className={sx(styles.caption)}>Conversation · Result card, a three-action workspace check met by setup alone</p>
        <AgentRunResultCardView detail={withPartlyPassedChecks(runs.ready)} now={now} actions={runActions} />
      </section>
      <section className={sx(styles.case)} data-preview-case="Agent run failed">
        <p className={sx(styles.caption)}>Conversation · reason card, stopped at its turn limit</p>
        <AgentRunResultCardView detail={runs.failed} now={now} actions={runActions} />
      </section>

      {(
        [
          ["Agent run panel limit reached", "Progress tab · Halted · Limit reached", limitReached, null],
          ["Agent run panel working", "Progress tab · Running", working.working, null],
          ["Agent run panel team limits", "Progress tab · Running · team limits after Extend", teamLimits, null],
          ["Agent run panel workflow", "Progress tab · workflow, stage 2 of 3", working.workflow, null],
          ["Agent run panel waiting", "Progress tab · Running · waiting for a usage reset", working.waiting, null],
          ["Agent run panel event wait", "Progress tab · Running · waiting for PR checks", working.eventWait, null],
          ["Agent run panel delegated wait", "Progress tab · Running · waiting for a delegated Agent", delegatedWait, null],
          ["Agent run panel approval", "Progress tab · Needs your answer · approval", working.working, "approval"],
          ["Agent run panel taken over", "Progress tab · Paused · taken over", working.takenOver, null],
          ["Agent run panel blocked", "Progress tab · Halted · blocked", working.blocked, null],
          ["Agent run panel stuck", "Progress tab · Halted · stuck (the bar has Retry)", working.stuck, null],
          ["Agent run panel ready", "Progress tab · Completed", runs.ready, null],
          ["Agent run panel checks", "Progress tab · Completed · workspace check met by setup alone", withPartlyPassedChecks(runs.ready), null],
          ["Agent run panel legacy checks", "Progress tab · legacy workflow run · workspace check met by setup alone", { ...withPartlyPassedChecks(runs.ready), agentRun: { ...withPartlyPassedChecks(runs.ready).agentRun, origin: undefined } }, null],
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
  // Mirrors the conversation's user shell (`chat-panel.styles.ts` `shell` + `shellUser`).
  shellUser: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: vars["--ads-space-4"], minWidth: 0, maxWidth: "88%", width: "fit-content" },
  composer: {
    position: "relative",
    zIndex: localStack["--stave-stack-raised"],
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

/**
 * The ready run with a `lint`/`setup`/`test` workspace check on its last AI
 * stage, met by `setup` alone: the case where "checks pass" must say which one.
 */
function withPartlyPassedChecks(detail: AgentRunDetail): AgentRunDetail {
  const run = structuredClone(detail);
  const revision = { status: "known" as const, revision: "preview" };
  const scripts = ["lint", "setup", "test"];
  const definitions = scripts.map((scriptId, index) => ({ scriptId, definitionHash: String(index).repeat(64) }));
  const text = "Workspace checks pass (lint, setup, test)";
  const stage = run.agentRun.workflow.stages.findLast((candidate) => candidate.kind === "ai");
  const record = stage ? run.stages.findLast((candidate) => candidate.stageId === stage.id) : undefined;
  if (stage?.kind !== "ai" || record?.report?.outcome !== "complete") return run;
  stage.acceptanceCriteria = [{ text, required: true, verification: "stave-check", scriptIds: scripts, scriptDefinitions: definitions }];
  record.report = { ...record.report, workspaceRevision: revision, acceptanceCriteria: [{ text, status: "met" }] };
  record.facts = {
    ...record.facts!,
    workspaceRevision: revision,
    workspaceScripts: scripts.map((scriptId, index) => ({
      source: "stave" as const,
      type: "run-script" as const,
      scriptId,
      definitionHash: definitions[index]!.definitionHash,
      exitCode: scriptId === "setup" ? 0 : 1,
      durationMs: 1200,
      outputTail: "",
      verification: { sourceRevision: revision, completedRevision: revision },
    })),
  };
  return run;
}
