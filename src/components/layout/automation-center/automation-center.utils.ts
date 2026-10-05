import { formatDateTime as formatLocaleDateTime, formatRelativeTime as formatLocaleRelativeTime } from "@/i18n/format";
import { i18n } from "@/i18n";
import {
  createDefaultAutomationRuntime,
  type AutomationEnvironmentInput,
  type AutomationRun,
  type AutomationSchedule,
  type AutomationSpec,
  type AutomationUpsertInput,
} from "@/lib/automations";
import {
  resolveCurrentRepositoryDefaultWorkspaceId,
  type RecentRepositoryState,
} from "@/store/repository.utils";

export interface AutomationEnvironmentOption {
  value: string;
  workspaceId: string;
  path: string;
  repositoryPath: string;
  label: string;
}

export type AutomationRepositorySource = Pick<
  RecentRepositoryState,
  | "repositoryPath"
  | "repositoryName"
  | "workspaces"
  | "workspacePathById"
  | "workspaceDefaultById"
>;

export function getAutomationErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function buildEnvironmentOptions(args: {
  recentRepositories: RecentRepositoryState[];
  activeRepository: AutomationRepositorySource | null;
}) {
  const options = new Map<string, AutomationEnvironmentOption>();
  const addRepository = (repository: AutomationRepositorySource) => {
    const workspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
      repositoryPath: repository.repositoryPath,
      workspaces: repository.workspaces,
      workspaceDefaultById: repository.workspaceDefaultById,
      workspacePathById: repository.workspacePathById,
    });
    options.set(repository.repositoryPath, {
      value: `repository:${repository.repositoryPath}`,
      workspaceId,
      path: repository.repositoryPath,
      repositoryPath: repository.repositoryPath,
      label: repository.repositoryName,
    });
  };
  args.recentRepositories.forEach(addRepository);
  if (args.activeRepository) {
    addRepository(args.activeRepository);
  }
  return [...options.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function createAutomationDraft(
  environment: AutomationEnvironmentInput | null,
): AutomationUpsertInput {
  return {
    name: "",
    prompt: "",
    enabled: true,
    schedule: {
      every: 1,
      unit: "days",
      at: { hour: 9, minute: 0 },
    },
    environment: environment ?? {
      kind: "repository",
      workspaceId: "",
      path: "",
      repositoryPath: "",
      label: "",
    },
    runtime: createDefaultAutomationRuntime("codex"),
    trustPolicy: "review-required",
    maxConcurrentRuns: 1,
    informationReferences: [],
  };
}

export function automationToDraft(automation: AutomationSpec): AutomationUpsertInput {
  return {
    name: automation.name,
    prompt: automation.prompt,
    enabled: automation.enabled,
    schedule: automation.schedule,
    environment: automation.environment,
    runtime: automation.runtime,
    trustPolicy: automation.trustPolicy,
    maxConcurrentRuns: automation.maxConcurrentRuns,
    informationReferences: automation.informationReferences,
  };
}

export function parseAutomationScheduleTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

/**
 * Drops schedule anchors the target unit cannot represent so the draft always
 * satisfies `AutomationScheduleSchema`.
 */
export function applyAutomationScheduleUnit(
  schedule: AutomationSchedule,
  unit: AutomationSchedule["unit"],
): AutomationSchedule {
  if (unit === "minutes" || unit === "hours") {
    return { every: schedule.every, unit };
  }
  if (unit === "days") {
    return {
      every: schedule.every,
      unit,
      ...(schedule.at ? { at: schedule.at } : {}),
    };
  }
  return {
    every: schedule.every,
    unit,
    ...(schedule.at ? { at: schedule.at } : {}),
    ...(schedule.at && schedule.weekdays?.length
      ? { weekdays: schedule.weekdays }
      : schedule.at && schedule.weekday !== undefined
        ? { weekday: schedule.weekday }
        : {}),
  };
}

export function formatDateTime(value: string | null) {
  return value ? formatLocaleDateTime(value) : "—";
}

export function formatRelativeTime(value: string | null, now = Date.now()) {
  return value ? formatLocaleRelativeTime(value, now) || "—" : "—";
}

export function formatRunDuration(run: AutomationRun, now = Date.now()) {
  const startedAt = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return "—";
  }
  const completedAt = run.completedAt
    ? new Date(run.completedAt).getTime()
    : now;
  const durationMs = Math.max(0, completedAt - startedAt);
  if (durationMs < 1000) {
    return i18n.t("workspace:format.duration.lessThanSecond");
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return i18n.t("workspace:format.duration.hoursMinutes", { hours, minutes });
  }
  if (minutes > 0) {
    return i18n.t("workspace:format.duration.minutesSeconds", { minutes, seconds });
  }
  return i18n.t("workspace:format.duration.seconds", { count: seconds });
}

/**
 * Semantic tone for a run status, in the same vocabulary the ADS `Badge`
 * tones use. Values only: this module stays free of styling so a worker, a
 * test, or a menu can import it without pulling in a stylesheet.
 */
export type AutomationRunTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";

export interface AutomationRunStatusPresentation {
  label: string;
  tone: AutomationRunTone;
}

/**
 * Status chip label and tone. `waiting` borrows the warning tone because it is
 * the state blocked on a person; `skipped` stays neutral so work that never
 * ran does not read as a failure.
 */
export const AUTOMATION_RUN_STATUS_PRESENTATION: Record<
  AutomationRun["status"],
  AutomationRunStatusPresentation
> = {
  running: { get label() { return i18n.t("automation:automationCenter.running"); }, tone: "accent" },
  waiting: { get label() { return i18n.t("automation:automationCenter.waiting"); }, tone: "warning" },
  completed: { get label() { return i18n.t("automation:automationCenter.completed"); }, tone: "success" },
  failed: { get label() { return i18n.t("automation:automationCenter.failed"); }, tone: "danger" },
  skipped: { get label() { return i18n.t("automation:automationCenter.skipped"); }, tone: "neutral" },
};

export function getRunStatusPresentation(
  status: AutomationRun["status"],
): AutomationRunStatusPresentation {
  return (
    AUTOMATION_RUN_STATUS_PRESENTATION[status] ??
    AUTOMATION_RUN_STATUS_PRESENTATION.running
  );
}

export function isActiveRunStatus(status: AutomationRun["status"]) {
  return status === "running" || status === "waiting";
}

export const AUTOMATION_RUN_FILTERS = [
  { value: "all", get label() { return i18n.t("automation:automationCenter.all"); } },
  { value: "active", get label() { return i18n.t("automation:automationCenter.active"); } },
  { value: "completed", get label() { return i18n.t("automation:automationCenter.completed"); } },
  { value: "failed", get label() { return i18n.t("automation:automationCenter.failed"); } },
] as const;

export type AutomationRunFilter =
  (typeof AUTOMATION_RUN_FILTERS)[number]["value"];

export function matchesRunFilter(
  run: AutomationRun,
  filter: AutomationRunFilter,
): boolean {
  switch (filter) {
    case "active":
      return isActiveRunStatus(run.status);
    case "completed":
      return run.status === "completed";
    case "failed":
      return run.status === "failed" || run.status === "skipped";
    default:
      return true;
  }
}
