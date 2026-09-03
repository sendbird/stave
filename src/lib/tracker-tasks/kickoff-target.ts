import {
  findMappedCraneTeamRuntime,
  findMappedStaveProjectPath,
  getCraneTeamKey,
  updateCraneTeamProjectMapping,
} from "@/lib/crane-connector/project-mapping";
import type {
  CraneProjectMapping,
  CraneTeamRuntimeMemory,
} from "@/lib/crane-connector/types";
import type { JiraProjectMapping } from "@/lib/jira-connector/types";
import type { TrackerSourceId, TrackerTask } from "@/lib/tracker-tasks/types";

/**
 * Where a kickoff's project and runtime defaults come from.
 *
 * Both trackers already store a per-scope mapping — Crane by team key, Jira by
 * project key — but they store it in different settings blocks with different
 * field names. Resolving that here keeps the kickoff sheet from carrying a
 * branch per source, and keeps the fallback order in one testable place.
 */

const MAX_PROJECT_MAPPINGS = 100;
const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]{0,63})-\d+$/;

/**
 * The mapping scope a ticket belongs to.
 *
 * Crane reuses its own team-key parser so a rule change there cannot drift from
 * this one; Jira keys are `PROJECT-123`, and the project key is the part a
 * mapping row is filed under.
 */
export function resolveTrackerTaskScopeKey(task: TrackerTask): string | null {
  if (task.source === "crane") {
    return getCraneTeamKey(task.key);
  }
  const match = ISSUE_KEY_PATTERN.exec(task.key.trim());
  return match?.[1] ? match[1].toUpperCase() : null;
}

/** Human label for the "Remember for ..." switch. */
export function describeTrackerTaskScope(task: TrackerTask): string | null {
  const key = resolveTrackerTaskScopeKey(task);
  return key ? key : null;
}

export interface TrackerTaskMappingSettings {
  craneMappings: readonly CraneProjectMapping[];
  jiraMappings: readonly JiraProjectMapping[];
}

function findJiraMapping(
  task: TrackerTask,
  mappings: readonly JiraProjectMapping[],
) {
  const scope = resolveTrackerTaskScopeKey(task);
  if (!scope) {
    return null;
  }
  return (
    mappings.find(
      (mapping) => mapping.jiraProjectKey.trim().toUpperCase() === scope,
    ) ?? null
  );
}

/**
 * The project a ticket should open against, or `null` when nothing is mapped.
 *
 * A mapping that points at a project the user has since unregistered is
 * ignored rather than preselected: a path Stave cannot open would fail at
 * submit, after the user has already filled in the rest of the form.
 */
export function findTrackerTaskMappedProjectPath(args: {
  task: TrackerTask;
  settings: TrackerTaskMappingSettings;
  registeredProjectPaths: readonly string[];
}): string | null {
  if (args.task.source === "crane") {
    return findMappedStaveProjectPath({
      issueKey: args.task.key,
      mappings: args.settings.craneMappings,
      registeredProjectPaths: args.registeredProjectPaths,
    });
  }
  const mapping = findJiraMapping(args.task, args.settings.jiraMappings);
  if (!mapping) {
    return null;
  }
  return args.registeredProjectPaths.includes(mapping.staveProjectPath)
    ? mapping.staveProjectPath
    : null;
}

/** The model/effort setup last remembered for this ticket's scope, if any. */
export function findTrackerTaskRuntimeMemory(args: {
  task: TrackerTask;
  settings: TrackerTaskMappingSettings;
}): CraneTeamRuntimeMemory | null {
  if (args.task.source === "crane") {
    return findMappedCraneTeamRuntime({
      issueKey: args.task.key,
      mappings: args.settings.craneMappings,
    });
  }
  return findJiraMapping(args.task, args.settings.jiraMappings)?.runtime ?? null;
}

export function updateJiraProjectMapping(args: {
  mappings: readonly JiraProjectMapping[];
  jiraProjectKey: string;
  staveProjectPath: string | null;
  runtime?: CraneTeamRuntimeMemory | null;
}): JiraProjectMapping[] {
  const projectKey = args.jiraProjectKey.trim().toUpperCase();
  const without = args.mappings.filter(
    (mapping) => mapping.jiraProjectKey.trim().toUpperCase() !== projectKey,
  );
  const staveProjectPath = args.staveProjectPath?.trim() || null;
  if (!staveProjectPath) {
    return without;
  }
  return [
    {
      jiraProjectKey: projectKey,
      staveProjectPath,
      ...(args.runtime ? { runtime: args.runtime } : {}),
    },
    ...without,
  ].slice(0, MAX_PROJECT_MAPPINGS);
}

export { updateCraneTeamProjectMapping };

/**
 * Last project a kickoff actually used, per source.
 *
 * `localStorage` rather than settings: it is a convenience default that costs
 * one click when lost, and syncing it would put a machine-local path into an
 * exportable settings document.
 */
export const TRACKER_TASKS_LAST_PROJECT_STORAGE_KEY =
  "stave.tracker-tasks.last-project";

export function parseTrackerTaskLastProjects(
  raw: string | null,
): Partial<Record<TrackerSourceId, string>> {
  if (!raw) {
    return {};
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return {};
  }
  const result: Partial<Record<TrackerSourceId, string>> = {};
  for (const source of ["crane", "jira"] as const) {
    const value = (decoded as Record<string, unknown>)[source];
    if (typeof value === "string" && value.trim().length > 0) {
      result[source] = value;
    }
  }
  return result;
}

export function readTrackerTaskLastProject(
  source: TrackerSourceId,
): string | null {
  try {
    return (
      parseTrackerTaskLastProjects(
        globalThis.localStorage?.getItem(
          TRACKER_TASKS_LAST_PROJECT_STORAGE_KEY,
        ) ?? null,
      )[source] ?? null
    );
  } catch {
    return null;
  }
}

export function writeTrackerTaskLastProject(
  source: TrackerSourceId,
  projectPath: string,
): void {
  try {
    const current = parseTrackerTaskLastProjects(
      globalThis.localStorage?.getItem(TRACKER_TASKS_LAST_PROJECT_STORAGE_KEY) ??
        null,
    );
    globalThis.localStorage?.setItem(
      TRACKER_TASKS_LAST_PROJECT_STORAGE_KEY,
      JSON.stringify({ ...current, [source]: projectPath }),
    );
  } catch {
    // A convenience default is not worth surfacing a storage failure for.
  }
}
