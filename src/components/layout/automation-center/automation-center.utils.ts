import {
  createDefaultRoutineRuntime,
  type RoutineEnvironmentInput,
  type RoutineRun,
  type RoutineSchedule,
  type RoutineSpec,
  type RoutineUpsertInput,
} from "@/lib/routines";
import {
  resolveCurrentProjectDefaultWorkspaceId,
  type RecentProjectState,
} from "@/store/project.utils";

export interface RoutineEnvironmentOption {
  value: string;
  workspaceId: string;
  path: string;
  projectPath: string;
  label: string;
}

export type RoutineProjectSource = Pick<
  RecentProjectState,
  | "projectPath"
  | "projectName"
  | "workspaces"
  | "workspacePathById"
  | "workspaceDefaultById"
>;

export function getRoutineErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function buildEnvironmentOptions(args: {
  recentProjects: RecentProjectState[];
  activeProject: RoutineProjectSource | null;
}) {
  const options = new Map<string, RoutineEnvironmentOption>();
  const addProject = (project: RoutineProjectSource) => {
    const workspaceId = resolveCurrentProjectDefaultWorkspaceId({
      projectPath: project.projectPath,
      workspaces: project.workspaces,
      workspaceDefaultById: project.workspaceDefaultById,
      workspacePathById: project.workspacePathById,
    });
    options.set(project.projectPath, {
      value: `repository:${project.projectPath}`,
      workspaceId,
      path: project.projectPath,
      projectPath: project.projectPath,
      label: project.projectName,
    });
  };
  args.recentProjects.forEach(addProject);
  if (args.activeProject) {
    addProject(args.activeProject);
  }
  return [...options.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function createRoutineDraft(
  environment: RoutineEnvironmentInput | null,
): RoutineUpsertInput {
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
      projectPath: "",
      label: "",
    },
    runtime: createDefaultRoutineRuntime("codex"),
    trustPolicy: "review-required",
    maxConcurrentRuns: 1,
    informationReferences: [],
  };
}

export function routineToDraft(routine: RoutineSpec): RoutineUpsertInput {
  return {
    name: routine.name,
    prompt: routine.prompt,
    enabled: routine.enabled,
    schedule: routine.schedule,
    environment: routine.environment,
    runtime: routine.runtime,
    trustPolicy: routine.trustPolicy,
    maxConcurrentRuns: routine.maxConcurrentRuns,
    informationReferences: routine.informationReferences,
  };
}

export function parseRoutineScheduleTime(value: string) {
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
 * satisfies `RoutineScheduleSchema`.
 */
export function applyRoutineScheduleUnit(
  schedule: RoutineSchedule,
  unit: RoutineSchedule["unit"],
): RoutineSchedule {
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
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 1000],
  ["minute", 60_000],
  ["hour", 3_600_000],
  ["day", 86_400_000],
  ["week", 604_800_000],
];

export function formatRelativeTime(value: string | null, now = Date.now()) {
  if (!value) {
    return "—";
  }
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return "—";
  }
  const deltaMs = target - now;
  const absoluteMs = Math.abs(deltaMs);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let scale = 1000;
  for (const [candidateUnit, candidateScale] of RELATIVE_UNITS) {
    if (absoluteMs >= candidateScale) {
      unit = candidateUnit;
      scale = candidateScale;
    }
  }
  return formatter.format(Math.round(deltaMs / scale), unit);
}

export function formatRunDuration(run: RoutineRun, now = Date.now()) {
  const startedAt = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return "—";
  }
  const completedAt = run.completedAt
    ? new Date(run.completedAt).getTime()
    : now;
  const durationMs = Math.max(0, completedAt - startedAt);
  if (durationMs < 1000) {
    return "<1s";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
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
  RoutineRun["status"],
  AutomationRunStatusPresentation
> = {
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export function getRunStatusPresentation(
  status: RoutineRun["status"],
): AutomationRunStatusPresentation {
  return (
    AUTOMATION_RUN_STATUS_PRESENTATION[status] ??
    AUTOMATION_RUN_STATUS_PRESENTATION.running
  );
}

export function isActiveRunStatus(status: RoutineRun["status"]) {
  return status === "running" || status === "waiting";
}

export const AUTOMATION_RUN_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

export type AutomationRunFilter =
  (typeof AUTOMATION_RUN_FILTERS)[number]["value"];

export function matchesRunFilter(
  run: RoutineRun,
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
