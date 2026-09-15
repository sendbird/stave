import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { CollaborationPanel } from "@/components/collaboration/CollaborationPanel";
import { ExchangeRow } from "@/components/delegation/ExchangeRow";
import { AdvisorExchangeCard } from "@/components/session/AdvisorExchangeMonitor";
import { TurnActivity } from "@/components/session/TurnActivity";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { ActionButton } from "@/components/system/ActionButton";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { fromChildTask } from "@/lib/delegation/exchange";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  buildStarterProfile,
  DEFAULT_AUTO_ROUTING_PROFILE_ID,
} from "@/lib/providers/auto-routing-profile";
import { upsertAdvisorConsultLogEntry } from "@/lib/providers/advisor-consult-log";
import {
  applyProviderTurnActivityEvents,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import { applyThemeClass } from "@/lib/themes/apply";
import type { TurnActivityPlacement } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import {
  AutoRouterPreviewSection,
  buildPreviewDecisionRecord,
  buildPreviewRateLimits,
  LIVE_PROMPT,
  PREVIEW_PROVIDER_AVAILABILITY,
  traceSamplePrompt,
} from "./auto-router-preview";

/**
 * Dev-only preview of the *in-flight* Advisor / Worker UX: a turn that is
 * still running, an advisor consult the primary is waiting on, a worker run
 * reporting progress, plus one settled consult, one failed worker and one
 * child task so every exchange state is on screen at once. The shipped
 * `collaboration` preview shows the settled state; this one shows the moment
 * the user is actually watching.
 */
const target = {
  taskId: "preview-live-task",
  workspaceId: "preview-live-workspace",
  projectPath: "/tmp/preview-project",
};
const TURN_ID = "preview-live-turn";
const PRIMARY_PROVIDER = "claude-code" as const;
const PRIMARY_MODEL = "claude-opus-5";
const PREVIOUS_TURN_ID = "preview-previous-turn";

const LIVE_QUESTION =
  "Should the close request drain pending commands before releasing the guest, or is ordering already guaranteed by the IPC layer?";

function buildMessages(startedAt: number): ChatMessage[] {
  const previousStartedAt = startedAt - 6 * 60_000;
  return [
    {
      id: "preview-previous-message",
      role: "assistant",
      model: "claude-opus-5",
      providerId: "claude-code",
      content: "",
      startedAt: new Date(previousStartedAt).toISOString(),
      completedAt: new Date(previousStartedAt + 48_000).toISOString(),
      parts: [
        {
          type: "tool_use",
          toolUseId: "preview-failed-worker",
          toolName: "Worker",
          workerExecution: {
            providerId: "claude-code",
            primaryModel: "claude-opus-5",
            presetId: "verified-patch",
            workerModel: "claude-sonnet-5",
            requestedWorkerModel: "auto",
            resolvedWorkerModel: "claude-sonnet-5",
            runtimeWorkerModel: "claude-sonnet-5",
            workerModelSource: "preset",
            workerModelRationale:
              "Verified patch prefers the fast tier for bounded edits.",
            workerEffort: "medium",
          },
          input: JSON.stringify({
            task: "Rename the terminal host close hook and update its three call sites.",
          }),
          output:
            "Worker stopped: the rename touched a generated file outside the allowed paths.",
          state: "output-error",
          progressMessages: ["Located three call sites.", "Edit rejected by path guard."],
        },
      ],
    },
    {
      id: "preview-live-message",
      role: "assistant",
      model: "claude-opus-5",
      providerId: "claude-code",
      content: "",
      startedAt: new Date(startedAt).toISOString(),
      parts: [
        {
          type: "tool_use",
          toolUseId: "preview-live-worker",
          toolName: "Worker",
          workerExecution: {
            providerId: "claude-code",
            primaryModel: "claude-opus-5",
            presetId: "verified-patch",
            workerModel: "claude-sonnet-5",
            requestedWorkerModel: "auto",
            resolvedWorkerModel: "claude-sonnet-5",
            runtimeWorkerModel: "claude-sonnet-5",
            workerModelSource: "preset",
            workerEffort: "high",
          },
          input: JSON.stringify({
            task: "Add a regression test for duplicate close requests in the terminal host and make it pass.",
          }),
          output: "",
          state: "input-available",
          progressMessages: [
            "Read electron/terminal/host.ts and the existing close tests.",
            "Drafted tests/terminal/host-close.test.ts covering duplicate close.",
          ],
        },
        {
          type: "tool_use",
          toolUseId: "preview-live-advisor",
          toolName: "stave_consult_advisor",
          input: JSON.stringify({ question: LIVE_QUESTION }),
          output: "",
          state: "input-available",
        },
      ],
    },
  ] as unknown as ChatMessage[];
}

function buildAdvisorSnapshot(startedAt: number): AdvisorExchangeSnapshot {
  const consultStartedAt = startedAt + 4_200;
  return {
    turnId: TURN_ID,
    exchangeId: "preview-live-consult-1",
    consultIndex: 1,
    consultLimit: 3,
    question: LIVE_QUESTION,
    primaryProviderId: "claude-code",
    primaryModel: "claude-opus-5",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    advisorEffort: "high",
    isolation: "codex-ephemeral-read-only",
    startedAt: consultStartedAt,
    // Short on purpose so the "Deadline passed" state is reachable in preview.
    timeoutMs: 90_000,
    outcome: "pending",
    settledConsults: 1,
    lastProgressAt: consultStartedAt + 6_000,
    progressDetail: "reading electron/terminal/host.ts",
    stages: [
      { phase: "armed", at: startedAt },
      { phase: "started", at: consultStartedAt },
      {
        phase: "progress",
        at: consultStartedAt + 6_000,
        detail: "reading electron/terminal/host.ts",
      },
    ],
  };
}

function buildSettledSnapshot(startedAt: number): AdvisorExchangeSnapshot {
  const consultStartedAt = startedAt - 5 * 60_000;
  return {
    turnId: PREVIOUS_TURN_ID,
    exchangeId: "preview-settled-consult",
    consultIndex: 1,
    consultLimit: 3,
    question: "Is the current retry loop safe against a duplicate close event?",
    primaryProviderId: "claude-code",
    primaryModel: "claude-opus-5",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    advisorEffort: "medium",
    isolation: "codex-ephemeral-read-only",
    startedAt: consultStartedAt,
    timeoutMs: 180_000,
    outcome: "completed",
    outcomeAt: consultStartedAt + 12_400,
    durationMs: 12_400,
    advice:
      "No. The retry loop re-arms the close timer without clearing the previous handle, so a duplicate close event fires the callback twice. Clear the handle before re-arming.",
    adviceChars: 168,
    inputTokens: 1_240,
    outputTokens: 96,
    totalCostUsd: 0.0119,
    settledConsults: 1,
    stages: [
      { phase: "started", at: consultStartedAt },
      { phase: "progress", at: consultStartedAt + 3_000, detail: "reasoning" },
      { phase: "completed", at: consultStartedAt + 12_400 },
    ],
  };
}

function buildChildTask(startedAt: number): ChildTaskSummary {
  return {
    runId: "preview-run",
    stepId: "preview-step",
    parentTaskId: target.taskId,
    delegationKey: "verify-close-ordering",
    childTaskId: "preview-child-task",
    childWorkspaceId: "preview-child-workspace",
    childTurnId: "preview-child-turn",
    providerId: "codex",
    requestedModel: "gpt-5.6-terra",
    requestedEffort: "high",
    lifecycle: "isolated",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt: new Date(startedAt - 30_000).toISOString(),
    updatedAt: new Date(startedAt).toISOString(),
    completedAt: null,
  } as unknown as ChildTaskSummary;
}

const PLACEMENTS: readonly TurnActivityPlacement[] = ["docked", "floating", "panel"];

const styles = stylex.create({
  // `#root` is `overflow: hidden` for the app shell, so the preview page owns
  // its own scroll container instead of relying on the document.
  page: {
    backgroundColor: vars["--ads-color-canvas"],
    boxSizing: "border-box",
    color: vars["--ads-color-text"],
    height: "100vh",
    overflowY: "auto",
    padding: vars["--ads-space-12"],
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginInline: "auto",
    maxWidth: "76rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  caption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  columns: {
    alignItems: "start",
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "minmax(0, 28rem) minmax(0, 1fr)",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  shelfHost: {
    minHeight: "22rem",
    position: "relative",
    width: "100%",
  },
  panelHost: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    height: "26rem",
    overflow: "hidden",
  },
  cardHost: {
    position: "relative",
    width: "100%",
  },
  rowHost: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-4"],
  },
});

export function AdvisorWorkerLivePreview() {
  const [dark, setDark] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [placement, setPlacement] = useState<TurnActivityPlacement>("docked");
  // Anchored at mount so elapsed time starts near zero instead of at whatever
  // the fixture author's clock said.
  const [startedAt] = useState(() => Date.now() - 12_000);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const snapshot = useMemo(() => buildAdvisorSnapshot(startedAt), [startedAt]);
  const settled = useMemo(() => buildSettledSnapshot(startedAt), [startedAt]);
  const childExchange = useMemo(
    () => fromChildTask(buildChildTask(startedAt)),
    [startedAt],
  );
  const rateLimitsSnapshot = useMemo(
    () => buildPreviewRateLimits(startedAt),
    [startedAt],
  );

  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);

  useEffect(() => {
    const handle = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    const state = useAppStore.getState();
    useAppStore.setState({
      settings: { ...state.settings, turnActivityPlacement: placement },
    });
  }, [placement]);

  useEffect(() => {
    const state = useAppStore.getState();
    const activityByTask = applyProviderTurnActivityEvents({
      activityByTask: startProviderTurnActivity({
        activityByTask: {},
        taskId: target.taskId,
        turnId: TURN_ID,
        providerId: "claude-code",
        now: startedAt,
      }),
      taskId: target.taskId,
      turnId: TURN_ID,
      providerId: "claude-code",
      now: startedAt + 2_000,
      events: [
        {
          type: "tool_use",
          toolUseId: "preview-live-read",
          toolName: "Read",
          input: JSON.stringify({ file_path: "electron/terminal/host.ts" }),
          startedAt: new Date(startedAt + 1_000).toISOString(),
        },
        {
          type: "tool_result",
          toolUseId: "preview-live-read",
          output: "…",
          isError: false,
        },
      ] as never,
    });
    // The live turn's prompt goes through the same router the composer uses so
    // the Auto pill and the resolution summary show a real decision record.
    // Always start from the code's starter profile so the preview reflects the
    // current rule table rather than whatever a previous session persisted.
    const autoRoutingProfile = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID);
    const liveTrace = traceSamplePrompt({
      sample: LIVE_PROMPT,
      profile: autoRoutingProfile,
      currentProviderId: PRIMARY_PROVIDER,
      currentModel: PRIMARY_MODEL,
      rateLimitsSnapshot,
    });
    useAppStore.setState({
      activeWorkspaceId: target.workspaceId,
      activeTaskId: target.taskId,
      projectPath: target.projectPath,
      settings: {
        ...state.settings,
        turnActivityPlacement: placement,
        autoRoutingEnabled: true,
        autoRoutingProfile,
      },
      providerAvailability: PREVIEW_PROVIDER_AVAILABILITY,
      rateLimitsSnapshot,
      autoRoutingDecisionByTask: {
        [target.taskId]: buildPreviewDecisionRecord({
          trace: liveTrace,
          currentProviderId: PRIMARY_PROVIDER,
          stance: autoRoutingProfile.stance,
          resolvedAt: startedAt,
        }),
      },
      tasks: [
        {
          id: target.taskId,
          title: "Terminal host close ordering",
          provider: "claude-code",
          updatedAt: new Date().toISOString(),
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: { [target.taskId]: buildMessages(startedAt) },
      activeTurnIdsByTask: { [target.taskId]: TURN_ID },
      providerTurnActivityByTask: activityByTask,
      advisorExchangeByTask: { [target.taskId]: snapshot },
      advisorConsultLogByTask: upsertAdvisorConsultLogEntry({
        logByTask: upsertAdvisorConsultLogEntry({
          logByTask: {},
          taskId: target.taskId,
          snapshot: settled,
          now: settled.outcomeAt,
        }),
        taskId: target.taskId,
        snapshot,
        now: snapshot.startedAt,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.container)}>
        <div className={sx(styles.header)}>
          <p className={sx(styles.caption)}>
            Advisor / Worker in-flight preview · sample data · turn still
            running
          </p>
          <div className={sx(styles.controls)}>
            {PLACEMENTS.map((option) => (
              <ActionButton
                key={option}
                size="xs"
                weight={placement === option ? "secondary" : "quiet"}
                aria-pressed={placement === option}
                onClick={() => setPlacement(option)}
              >
                {option}
              </ActionButton>
            ))}
            <ActionButton size="xs" onClick={() => setDark(!dark)}>
              {dark ? "Light theme" : "Dark theme"}
            </ActionButton>
          </div>
        </div>
        <TaskScopeProvider taskId={target.taskId}>
          <div className={sx(styles.columns)}>
            <div className={sx(styles.stack)}>
              <p className={sx(styles.label)}>
                Turn activity · {placement} host (single live host)
              </p>
              {placement === "panel" ? (
                <div className={sx(styles.panelHost)}>
                  <TurnActivity host="panel" />
                </div>
              ) : (
                <div className={sx(styles.shelfHost)}>
                  <TurnActivity host={placement} />
                </div>
              )}
              <p className={sx(styles.label)}>
                Child task exchange row (fixture, not store-backed)
              </p>
              <div className={sx(styles.rowHost)}>
                <ExchangeRow exchange={childExchange} nowMs={nowMs} />
              </div>
              <p className={sx(styles.label)}>
                Standalone advisor card (Lens harness; no longer mounted in chat)
              </p>
              <div className={sx(styles.cardHost)}>
                <AdvisorExchangeCard
                  snapshot={snapshot}
                  nowMs={nowMs}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((v) => !v)}
                  onSkip={() => {}}
                  onDismiss={() => {}}
                  canSkip
                  consultLogCount={2}
                  onOpenLog={() => {}}
                />
              </div>
            </div>
            <div className={sx(styles.stack)}>
              <p className={sx(styles.label)}>Right rail · Delegations panel</p>
              <CollaborationPanel target={target} />
            </div>
          </div>
          <AutoRouterPreviewSection
            taskId={target.taskId}
            currentProviderId={PRIMARY_PROVIDER}
            currentModel={PRIMARY_MODEL}
            rateLimitsSnapshot={rateLimitsSnapshot}
          />
        </TaskScopeProvider>
      </div>
    </main>
  );
}
