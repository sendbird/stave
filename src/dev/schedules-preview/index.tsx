import { useLayoutEffect, useState } from "react";
import { applyAppLocale } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { AutomationCenterView } from "@/components/layout/automation-center/AutomationCenterView";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { AutomationRun, AutomationSpec } from "@/lib/automations";
import type { WakeUp, WakeUpSummary } from "@/lib/supervision/wake-up-policy";
import { DEFAULT_PULL_REQUEST_WATCH_PROMPT } from "@/lib/supervision/pull-request-watch";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import { useScheduleRequestStore } from "@/store/schedule-request-store";

/**
 * The Schedules surface on the dev preview (`?stavePreview=schedules`): one
 * start-a-task schedule that last failed, one paused, three check-backs (one on
 * a cadence, one when subagents finish, one watching a pull request), with
 * stubbed bridge calls.
 * `&theme=dark` or `&theme=<built-in theme id>` renders under that theme;
 * `&select=check-back` selects the first check-back, `&new=1` opens the new
 * schedule sheet, `&checkback=1` opens it on an existing task (the task menu's
 * Check back… item), `&empty=1` shows the empty state, `&only=check-backs`
 * lists check-backs and no start-a-task schedules, `&fail=check-backs` makes
 * the check-back list fail, `&slow=check-backs` answers it after 1.5s, and
 * `&lang=ko` renders it in Korean.
 */
const params = new URLSearchParams(window.location.search);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const ENVIRONMENT = {
  kind: "repository" as const,
  workspaceId: "preview-workspace",
  path: "/tmp/preview-repo",
  repositoryPath: "/tmp/preview-repo",
  label: "preview-repo",
};

function automation(patch: Partial<AutomationSpec>): AutomationSpec {
  return {
    id: "auto-review",
    name: "Daily repository review",
    prompt: "Review changes since the last run and summarize risks.",
    enabled: true,
    schedule: { every: 1, unit: "days", at: { hour: 9, minute: 0 } },
    environment: ENVIRONMENT,
    runtime: { provider: "claude-code", model: "claude-sonnet-4-6", effort: "medium" },
    trustPolicy: "review-required",
    maxConcurrentRuns: 1,
    informationReferences: [],
    createdAt: ago(10_000),
    updatedAt: ago(10_000),
    lastRunAt: ago(180),
    nextRunAt: ahead(21 * 60),
    ...patch,
  } as unknown as AutomationSpec;
}

const AUTOMATIONS = [
  automation({}),
  automation({ id: "auto-deps", name: "Weekly dependency check", enabled: false, lastRunAt: null, nextRunAt: null }),
];

const RUNS = [
  {
    id: "run-1",
    automationId: "auto-review",
    workspaceId: "preview-workspace",
    repositoryPath: "/tmp/preview-repo",
    taskId: null,
    turnId: null,
    status: "failed",
    trigger: "scheduled",
    scheduledFor: ago(180),
    startedAt: ago(180),
    completedAt: ago(175),
    resultPreview: null,
    error: "The provider stopped before finishing.",
  },
] as unknown as AutomationRun[];

function wakeUp(patch: Record<string, unknown>): WakeUp {
  return {
    id: "wake-ci",
    workspaceId: "preview-workspace",
    taskId: "preview-task",
    prompt: "Re-check CI on the pull request. Report only on change.",
    trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
    maxOccurrences: null,
    expiresAt: null,
    repositoryPath: "/tmp/preview-repo",
    fingerprint: { providerId: "claude-code", model: "claude-opus-4-7" },
    state: "scheduled",
    pauseReason: null,
    stopReason: null,
    reasonDetail: null,
    nextRunAt: ahead(25),
    lastOccurrenceAt: ago(35),
    occurrenceCount: 4,
    skippedCount: 0,
    createdAt: ago(400),
    updatedAt: ago(35),
    ...patch,
  } as unknown as WakeUp;
}

const WAKE_UPS = [
  wakeUp({}),
  wakeUp({
    id: "wake-subagents",
    taskId: "preview-task-2",
    prompt: "Summarize what the subagents found.",
    trigger: { kind: "completion" },
    nextRunAt: null,
    lastOccurrenceAt: null,
    occurrenceCount: 0,
  }),
  wakeUp({
    id: "wake-pr",
    taskId: "preview-task-4",
    prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT,
    trigger: { kind: "pull_request", events: ["checks_failed", "merge_conflict"] },
    maxOccurrences: 10,
    nextRunAt: null,
    lastOccurrenceAt: ago(14),
    occurrenceCount: 2,
    pullRequestWatch: {
      pullRequest: { number: 128, url: "https://github.com/acme/preview-repo/pull/128", title: "feat(uploads): resume interrupted uploads" },
      lastCheckedAt: ago(1),
      lastSeen: { state: "OPEN", failingChecks: 1, conflicting: false, reviewComments: 0, checksPending: false },
      consecutiveReadFailures: 0,
      lastReadError: null,
      pendingSince: null,
    },
  }),
];

const summaries = (): WakeUpSummary[] =>
  WAKE_UPS.map((item) => ({
    wakeUpId: item.id,
    taskId: item.taskId,
    triggerKind: item.trigger.kind,
    state: item.state,
    reason: null,
    nextRunAt: item.nextRunAt,
    occurrenceCount: item.occurrenceCount,
    skippedCount: 0,
  })) as WakeUpSummary[];

function installBridgeStubs() {
  const empty = params.get("empty") === "1";
  const onlyCheckBacks = params.get("only") === "check-backs";
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  api.automations = {
    list: async () => ({
      ok: true,
      snapshot: {
        automations: empty || onlyCheckBacks ? [] : AUTOMATIONS,
        runs: empty || onlyCheckBacks ? [] : RUNS,
      },
    }),
    listInformationReferences: async () => ({ ok: true, options: [] }),
  };
  api.wakeUps = {
    list: async () => {
      if (params.get("slow") === "check-backs") await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (params.get("fail") === "check-backs") {
        return { ok: false, wakeUps: [], summaries: [], message: "The schedule store is locked by another process." };
      }
      return { ok: true, wakeUps: empty ? [] : WAKE_UPS, summaries: empty ? [] : summaries() };
    },
    create: async () => ({ ok: true, wakeUp: WAKE_UPS[0] ?? null }),
    update: async () => ({ ok: true, wakeUp: WAKE_UPS[0] ?? null }),
    setPaused: async () => ({ ok: true, wakeUp: WAKE_UPS[0] ?? null }),
    remove: async () => ({ ok: true }),
    subscribeChanged: () => () => {},
  };
}

export function SchedulesPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
  }, [theme, builtinTheme]);
  useLayoutEffect(() => {
    applyAppLocale(params.get("lang") ?? "en");
    installBridgeStubs();
    useAppStore.setState({
      repositoryPath: "/tmp/preview-repo",
      repositoryName: "preview-repo",
      activeWorkspaceId: "preview-workspace",
      workspacePathById: { "preview-workspace": "/tmp/preview-repo" },
      tasks: [
        { id: "preview-task", title: "Fix the flaky upload test", provider: "claude-code" },
        { id: "preview-task-2", title: "Audit the settings sidebar", provider: "claude-code" },
        { id: "preview-task-3", title: "Draft release notes", provider: "codex" },
        { id: "preview-task-4", title: "Resume interrupted uploads", provider: "claude-code" },
      ],
    } as never);
    if (params.get("checkback") === "1") {
      useScheduleRequestStore.getState().requestCheckBack({ workspaceId: "preview-workspace", taskId: "preview-task-3" });
    }
    setReady(true);
  }, []);
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.frame)}>{ready ? <AutomationCenterView /> : null}</div>
    </main>
  );
}

const styles = stylex.create({
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  frame: { flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" },
});
