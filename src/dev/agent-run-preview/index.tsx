import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { AgentRunBarView } from "@/components/agent-runs/AgentRunBar";
import { ComposerShelfSurface } from "@/components/session/composer-shelf/ComposerShelf";
import { AgentRunDetailView } from "@/components/agent-runs/AgentRunPanel";
import { AgentRunReportView } from "@/components/agent-runs/AgentRunReportView";
import { SignOffCard } from "@/components/agent-runs/SignOffCard";
import { EvidenceList } from "@/components/agent-runs/EvidenceList";
import { StageDividerView } from "@/components/agent-runs/StageDivider";
import { FleetAgentRunStrip } from "@/components/agent-runs/FleetAgentRunStrip";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { WakeUpSectionView } from "@/components/agent-runs/WakeUpSection";
import type { WakeUp } from "@/lib/supervision/wake-up-policy";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  createAgentRun,
  listExternalEffectStages,
  type AgentRunEvent,
  type AgentRunStageRecord,
} from "@/lib/agent-runs/domain";
import { buildAgentRunReport } from "@/lib/agent-runs/report";
import { createWorkflowFromStarter, findWorkflowStarter } from "@/dev/fixtures/legacy-workflow-starters";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { agentRunFleetDetails, AgentRunPreviewCases } from "./agent-run-cases";
import { buildAgentRunFixtures } from "./agent-run-fixtures";
import { PlanVisibilityCases } from "./plan-visibility-cases";
import { StageProgressCases, type ProgressCase } from "./progress-cases";

/*
 * Dev-only preview of the agent run surfaces, rendered from fixtures:
 * `?stavePreview=agent-run`. Every state the Lens pass checks is on one page.
 */

const START = new Date(Date.now() - 22 * 60_000);
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000).toISOString();

const workflow = createWorkflowFromStarter(findWorkflowStarter("request-to-pr")!, {
  now: START,
  id: "workflow_preview",
});
const created = createAgentRun({
  id: "agent-run-preview",
  input: {
    workspaceId: "preview-workspace",
    leadTaskId: "preview-task",
    workflow,
    assignment: "Fix billing table overflow on narrow screens.",
    consent: {
      checkIns: "plan-and-publishing",
      permissionMode: "guided",
      authorizedEffectStageIds: listExternalEffectStages(workflow).map((stage) => stage.id),
    },
  },
  repositoryPath: "/tmp/preview-project",
  fingerprint: { providerId: "claude-code", model: "sonnet" },
  now: START,
});

function record(stageId: string, patch: Partial<AgentRunStageRecord>): AgentRunStageRecord {
  return { ...created.upserts[0]!, stageId, ...patch };
}

const understand = record("understand", {
  status: "completed",
  startedAt: at(0),
  endedAt: at(3),
  reportRevision: 1,
  report: {
    outcome: "complete",
    summary: "Overflow comes from the fixed-width amount column; scope limited to the billing table.",
    decisions: [{ decision: "Limit scope to the billing table", reason: "Other tables use the shared grid." }],
    evidence: [{ label: "Slack thread", kind: "link", ref: "https://example.com/thread" }],
    artifacts: [],
    acceptanceCriteria: [
      { text: "Table scrolls horizontally below 768px", status: "met" },
      { text: "No layout shift on desktop", status: "unverified" },
    ],
    reportedAt: at(3),
    turnId: "turn-1",
  },
});
const build = record("build", {
  status: "completed",
  startedAt: at(4),
  endedAt: at(13),
  reportRevision: 1,
  report: {
    outcome: "complete",
    summary: "Wrapped the table in a scroll container with a container query.",
    decisions: [{ decision: "Container query instead of a resize listener", reason: "Keeps SSR stable." }],
    evidence: [
      { label: "Typecheck", kind: "check", command: "bun run typecheck", toolCallId: "call-typecheck" },
      { label: "Visual check at 375px", kind: "observation" },
    ],
    artifacts: [],
    reportedAt: at(13),
    turnId: "turn-2",
  },
  facts: {
    diff: { filesChanged: 4, insertions: 82, deletions: 17 },
    commands: [{ command: "bun run typecheck", exitCode: 0, toolCallId: "call-typecheck" }],
    toolCalls: [],
    action: null,
  },
});

function detail(
  currentStageIndex: number,
  current: Partial<AgentRunStageRecord>,
  agentRun: Partial<AgentRunDetail["agentRun"]> = {},
  events: AgentRunEvent[] = [],
): AgentRunDetail {
  const stageId = workflow.stages[currentStageIndex]!.id;
  // Stages between Build and the current one are done.
  const between = workflow.stages
    .slice(2, currentStageIndex)
    .map((stage) => record(stage.id, { status: "completed", startedAt: at(14), endedAt: at(15) }));
  return {
    agentRun: { ...created.agentRun, currentStageIndex, turnCount: 5, ...agentRun },
    stages: [understand, build, ...between, record(stageId, { startedAt: at(14), ...current })],
    events: [
      {
        id: "e1",
        agentRunId: "agent-run-preview",
        sequence: 1,
        kind: "stage-completed",
        idempotencyKey: null,
        detail: { stageId: "build", attempt: 1 },
        createdAt: at(14),
      },
      ...events,
    ],
    report: null,
    usage: { turns: 5, measuredTurns: 5, inputTokens: 148_000, outputTokens: 21_400, costUsd: 0.84 },
  };
}

const live = detail(2, { status: "running" });
const takenOver = detail(2, { status: "running" }, {
  state: "paused",
  pauseReason: "taken-over",
  reasonDetail: "You took over.",
});
const signOff = detail(2, { status: "awaiting-sign-off", startedAt: null });
const blocked = detail(2, {
  status: "blocked",
  blockReason: "agent-blocked",
  detail: "Which breakpoint should the table switch at: 768px or 1024px?",
});
const stuck = detail(4, { status: "stuck", detail: "e2e has been pending for 45 minutes." });
const unavailable = detail(2, {
  status: "blocked",
  blockReason: "reporting-unavailable",
  detail: "Stave's local tools are unreachable, so the agent could not report this stage.",
});
const completedAggregate = {
  agentRun: { ...created.agentRun, state: "stopped" as const, stopReason: "task-unavailable" as const, reasonDetail: "The lead task was archived.", currentStageIndex: 2, turnCount: 11, updatedAt: at(34) },
  stages: [understand, build, record("verify", { status: "cancelled", startedAt: at(14), endedAt: at(34), detail: "The run was cancelled." })],
};
const completed: AgentRunDetail = {
  ...completedAggregate,
  events: [],
  report: buildAgentRunReport({
    aggregate: completedAggregate,
    workspace: {
      branch: "fix/billing-overflow",
      branchPushed: true,
      openPullRequest: { url: "https://github.com/acme/app/pull/612", number: 612, isDraft: true },
    },
    endedAt: new Date(at(34)),
  }),
};
completed.report = { ...completed.report!, usage: { turns: 11, measuredTurns: 11, inputTokens: 402_000, outputTokens: 51_000, costUsd: 2.37 } };

const lastStageIndex = workflow.stages.length - 1;
const firstStage: AgentRunDetail = {
  ...live,
  agentRun: { ...live.agentRun, currentStageIndex: 0, turnCount: 1 },
  stages: [record("understand", { status: "running", startedAt: at(0) })],
  events: [],
};
const done = detail(lastStageIndex, { status: "completed", endedAt: at(21) }, { state: "completed", updatedAt: at(21) });
const cancelled = detail(3, { status: "cancelled", endedAt: at(18) }, { state: "cancelled", updatedAt: at(18) });
const longTitle: AgentRunDetail = {
  ...live,
  agentRun: {
    ...live.agentRun,
    workflow: {
      ...workflow,
      stages: workflow.stages.map((stage, index) =>
        index === 2 ? { ...stage, title: "Verify the billing table at every breakpoint and theme" } : stage,
      ),
    },
  },
};
const progressCases: ProgressCase[] = [
  ["Running · stage 3 of 6", live],
  ["First stage · starts at zero", firstStage],
  ["Long stage title", longTitle],
  ["Waiting for your sign-off", signOff],
  ["Paused · you took over", takenOver],
  ["Blocked", blocked],
  ["Stuck", stuck],
  ["Stopped", completed, "attention"],
  ["Cancelled", cancelled],
  ["Done", done],
];
const progressSteps: AgentRunDetail[] = [
  firstStage,
  ...workflow.stages.slice(2).map((_, offset) => detail(offset + 2, { status: "running" })),
  done,
];

const noop = (async () => ({ ok: true, agentRun: null })) as never;

const previewWakeUp = {
  id: "wake-preview",
  workspaceId: "preview-workspace",
  taskId: "preview-task",
  trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
} as unknown as WakeUp;

function seedFleetAgentRuns() {
  const as = (detail: AgentRunDetail, id: string, workspaceId: string) => ({
    ...detail,
    agentRun: { ...detail.agentRun, id, workspaceId },
  });
  useFleetAgentRunsStore.setState({
    details: {
      "fleet-sign-off": as(signOff, "fleet-sign-off", "fleet-a"),
      "fleet-live": as(live, "fleet-live", "fleet-b"),
      "fleet-stuck": as(stuck, "fleet-stuck", "fleet-c"),
      ...agentRunFleetDetails(),
    },
  });
}

export function AgentRunPreview() {
  const params = new URLSearchParams(window.location.search);
  // `themeId=dracula` applies a built-in theme; `theme=dark` the default dark one.
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === params.get("themeId")) ?? null;
  const [dark, setDark] = useState(() => (builtinTheme ? builtinTheme.baseMode === "dark" : params.get("theme") === "dark"));
  useLayoutEffect(() => {
    applyCustomTheme({ theme: builtinTheme });
  }, [builtinTheme]);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  const now = Date.now();
  const actions = { onTakeOver: () => {}, onResume: () => {}, onOpenPanel: () => {} };
  useLayoutEffect(() => { if (params.get("only") !== "plan-visibility") seedFleetAgentRuns(); }, []);
  const width = Number(params.get("w")) || null;
  if (params.get("only") === "progress") {
    const runs = buildAgentRunFixtures(new Date(now - 4 * 60_000));
    const runActions = { onStop: () => {}, onTakeControl: () => {} };
    return (
      <main className={sx(styles.page)}>
        <div className={sx(styles.container)} style={width ? { maxWidth: width } : undefined}>
          <div className={sx(styles.header)}>
            <h1 className={sx(styles.heading)}>Stage progress</h1>
            <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
              {dark ? "Light theme" : "Dark theme"}
            </ActionButton>
          </div>
          <StageProgressCases cases={progressCases} steps={progressSteps} now={now} />
          {(
            [
              ["Composer live", "Composer · run, stage 3 of 6", live, "Running the tests", null],
              ["Composer sign-off", "Composer · run waiting for a sign-off", signOff, null, null],
              ["Agent run workflow", "Composer · agent with a workflow, stage 2 of 3", runs.workflow, "Reading the export handler", runActions],
              ["Agent run single stage", "Composer · one-stage agent run: no track", runs.working, "Running the tests", runActions],
            ] as const
          ).map(([id, label, value, phrase, agentActions]) => (
            <section key={id} className={sx(styles.case)} data-preview-case={id}>
              <p className={sx(styles.caption)}>{label}</p>
              <div className={sx(styles.composerStack)}>
                <ComposerShelfSurface>
                  <AgentRunBarView
                    detail={value}
                    nowPhrase={phrase}
                    now={now}
                    reducedMotion={false}
                    actions={actions}
                    agentActions={agentActions ?? undefined}
                  />
                </ComposerShelfSurface>
                <MockComposer placeholder="Reply…" />
              </div>
            </section>
          ))}
          <section className={sx(styles.case)} data-preview-case="Fleet">
            <p className={sx(styles.caption)}>Fleet workspace cards</p>
            <div className={sx(styles.fleet)}>
              {(["fleet-a", "fleet-b", "fleet-c", "fleet-f"] as const).map((workspaceId) => (
                <div key={workspaceId} className={sx(styles.fleetCard)}>
                  <div className={sx(styles.fleetHeader)}>
                    <strong>{workspaceId}</strong>
                  </div>
                  <FleetAgentRunStrip workspaceId={workspaceId} onOpen={() => {}} />
                </div>
              ))}
            </div>
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Panel">
            <p className={sx(styles.caption)}>Progress tab · run running</p>
            <AgentRunDetailView detail={live} now={now} onCommand={noop} onShowTool={() => {}} />
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Report">
            <p className={sx(styles.caption)}>Progress tab · run stopped</p>
            <AgentRunDetailView detail={completed} now={now} onCommand={noop} />
          </section>
        </div>
      </main>
    );
  }
  if (params.get("only") === "agent-run" || params.get("only") === "plan-visibility") {
    return (
      <main className={sx(styles.page)}>
        <div className={sx(styles.container)}>
          <div className={sx(styles.header)}>
            <h1 className={sx(styles.heading)}>Agent run</h1>
            <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
              {dark ? "Light theme" : "Dark theme"}
            </ActionButton>
          </div>
          {params.get("only") === "plan-visibility" ? <PlanVisibilityCases width={width} /> : <AgentRunPreviewCases now={now} width={width} />}
        </div>
      </main>
    );
  }
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.container)}>
        <div className={sx(styles.header)}>
          <h1 className={sx(styles.heading)}>Run surfaces</h1>
          <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
            {dark ? "Light theme" : "Dark theme"}
          </ActionButton>
        </div>

        <AgentRunPreviewCases now={now} width={width} />

        <section className={sx(styles.case)} data-preview-case="Verification evidence">
          <p className={sx(styles.caption)}>Check evidence · process status and current work</p>
          <EvidenceList onShowTool={() => {}} evidence={[
            { label: "Failed shell check", kind: "check", command: "bun test", toolCallId: "failed", source: "provider", outcome: "failed", exitCode: 7, freshness: "unknown" },
            { label: "Provider response without a process status", kind: "check", command: "bun run typecheck", source: "provider", outcome: "unknown", exitCode: null, freshness: "unknown" },
            { label: "Successful current workspace check", kind: "check", command: "bun test", source: "stave", outcome: "succeeded", exitCode: 0, freshness: "current" },
            { label: "Workspace changed after the check", kind: "check", command: "bun test", source: "stave", outcome: "succeeded", exitCode: 0, freshness: "stale" },
            { label: "Agent assessment of the documentation", kind: "observation", source: "agent" },
          ]} />
        </section>

        <section className={sx(styles.case)} data-preview-case="Composer live">
          <p className={sx(styles.caption)}>In the composer · a stage turn is running</p>
          <div className={sx(styles.chat)}>
            <p className={sx(styles.message)}>Build is done. The table now scrolls inside its own container below 768px.</p>
            <StageDividerView text="Stage 3 · Verify — started automatically after Build reported done" />
            <p className={sx(styles.message)}>Running the project checks, then a visual pass at 375, 768 and 1280px.</p>
            <div className={sx(styles.composerStack)}>
              <ComposerShelfSurface><AgentRunBarView detail={live} nowPhrase="Running the tests" now={now} reducedMotion={false} actions={actions} /></ComposerShelfSurface>
              <MockComposer placeholder="Reply to guide Verify — the run carries on" />
            </div>
          </div>
        </section>

        <section className={sx(styles.case)} data-preview-case="Composer sign-off">
          <p className={sx(styles.caption)}>In the composer · waiting for a sign-off</p>
          <div className={sx(styles.chat)}>
            <SignOffCard detail={signOff} onSignOff={() => {}} onAskForChanges={() => {}} onReviewChanges={() => {}} />
            <div className={sx(styles.composerStack)}>
              <ComposerShelfSurface><AgentRunBarView detail={signOff} nowPhrase={null} now={now} reducedMotion={false} actions={actions} /></ComposerShelfSurface>
              <MockComposer placeholder="Reply…" />
            </div>
          </div>
        </section>

        {(
          [
            ["Blocked", blocked],
            ["Stuck", stuck],
            ["Reporting unavailable", unavailable],
            ["Taken over", takenOver],
          ] as const
        ).map(([label, value]) => (
          <section key={label} className={sx(styles.case)} data-preview-case={label}>
            <p className={sx(styles.caption)}>{label}</p>
            <div className={sx(styles.composerStack)}>
              <ComposerShelfSurface><AgentRunBarView detail={value} nowPhrase={null} now={now} reducedMotion={false} actions={actions} /></ComposerShelfSurface>
              <MockComposer placeholder="Reply…" />
            </div>
          </section>
        ))}

        <section className={sx(styles.case, styles.narrow)} data-preview-case="Narrow">
          <p className={sx(styles.caption)}>Narrow width, reduced motion</p>
          <div className={sx(styles.composerStack)}>
            <ComposerShelfSurface><AgentRunBarView detail={live} nowPhrase="Editing files" now={now} reducedMotion actions={actions} /></ComposerShelfSurface>
            <MockComposer placeholder="Reply…" />
          </div>
        </section>

        <section className={sx(styles.case)} data-preview-case="Fleet">
          <p className={sx(styles.caption)}>Fleet workspace cards</p>
          <div className={sx(styles.fleet)}>
            {(["fleet-a", "fleet-b", "fleet-c"] as const).map((workspaceId, index) => (
              <div key={workspaceId} className={sx(styles.fleetCard)}>
                <div className={sx(styles.fleetHeader)}>
                  <strong>{["billing-overflow", "csv-export", "header-refactor"][index]}</strong>
                  <span className={sx(styles.caption)}>acme/app</span>
                </div>
                <FleetAgentRunStrip workspaceId={workspaceId} onOpen={() => {}} />
                <div className={sx(styles.fleetTasks)}>1 task</div>
              </div>
            ))}
          </div>
        </section>

        <div className={sx(styles.rails)}>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Panel">
            <p className={sx(styles.caption)}>Progress tab · run running</p>
            <div data-testid="agent-run-panel-frame">
              <AgentRunDetailView detail={live} now={now} onCommand={noop} onShowTool={() => {}} />
            </div>
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Panel blocked">
            <p className={sx(styles.caption)}>Progress tab · run blocked</p>
            <AgentRunDetailView detail={blocked} now={now} onCommand={noop} onShowTool={() => {}} />
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Report">
            <p className={sx(styles.caption)}>Progress tab · run ended</p>
            <AgentRunDetailView
              detail={completed}
              now={now}
              onCommand={noop}
              reportActions={{
                addToPullRequest: async () => "Added the report to the pull request description.",
                saveDecisions: async () => "Saved 2 decisions as memory candidates. Review them in Memory.",
                shareToSlack: async () => "The task is posting the report to the thread. Its reply shows in the task.",
                suggestedSlackThread: "https://acme.slack.com/archives/C123ABC/p1727000000123456",
              }}
            />
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Report only">
            <p className={sx(styles.caption)}>Run report in the Results tab</p>
            <AgentRunReportView
              report={completed.report!}
              actions={{
                addToPullRequest: async () => "Added the report to the pull request description.",
                saveDecisions: async () => "Saved 2 decisions as memory candidates. Review them in Memory.",
                shareToSlack: async () => "The task is posting the report to the thread. Its reply shows in the task.",
                suggestedSlackThread: "https://acme.slack.com/archives/C123ABC/p1727000000123456",
              }}
            />
          </section>
          <section className={sx(styles.case, styles.rail)} data-preview-case="Wake-ups">
            <p className={sx(styles.caption)}>Wake-ups in the Progress tab</p>
            <WakeUpSectionView
              entry={{
                wakeUp: previewWakeUp,
                summary: {
                  wakeUpId: "wake-preview",
                  taskId: "preview-task",
                  triggerKind: "schedule",
                  state: "scheduled",
                  reason: null,
                  nextRunAt: new Date(now + 12 * 60_000).toISOString(),
                  occurrenceCount: 3,
                  skippedCount: 1,
                },
              }}
              now={now}
              onSetPaused={() => {}}
              onRemove={() => {}}
            />
            <WakeUpSectionView
              entry={{
                wakeUp: previewWakeUp,
                summary: {
                  wakeUpId: "wake-preview",
                  taskId: "preview-task",
                  triggerKind: "schedule",
                  state: "paused",
                  reason: "A run is running on this task. This wake-up resumes when the run ends.",
                  nextRunAt: null,
                  occurrenceCount: 3,
                  skippedCount: 1,
                },
              }}
              now={now}
              onSetPaused={() => {}}
              onRemove={() => {}}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

/** A stand-in for the composer card, for the stacking. */
function MockComposer({ placeholder }: { placeholder: string }) {
  return <div className={sx(styles.composer)}>{placeholder}</div>;
}

const styles = stylex.create({
  page: {
    height: "100vh",
    overflowY: "auto",
    padding: vars["--ads-space-24"],
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-32"],
    marginInline: "auto",
    maxWidth: "52rem",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  heading: { margin: 0, fontSize: vars["--ads-font-size-title"], fontWeight: vars["--ads-font-weight-medium"] },
  case: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  caption: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  chat: { display: "flex", flexDirection: "column", maxWidth: "46rem" },
  message: {
    margin: 0,
    marginBottom: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  composerStack: { display: "flex", flexDirection: "column", maxWidth: "46rem" },
  narrow: { maxWidth: 360 },
  rails: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(22rem, 1fr))", gap: vars["--ads-space-24"], alignItems: "start" },
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
  fleetTasks: {
    padding: vars["--ads-space-12"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  composer: {
    position: "relative",
    zIndex: 10,
    minHeight: 96,
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
});
