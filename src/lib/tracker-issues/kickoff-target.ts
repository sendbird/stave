import {
  findMappedCraneTeamRuntime,
  findMappedStaveRepositoryPath,
  getCraneTeamKey,
  updateCraneTeamRepositoryMapping,
} from "@/lib/crane-connector/project-mapping";
import type {
  CraneRepositoryMapping,
  CraneTeamRuntimeMemory,
} from "@/lib/crane-connector/types";
import type { JiraProjectMapping } from "@/lib/jira-connector/types";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
  type TrackerIssue,
} from "@/lib/tracker-issues/types";

/**
 * Where a kickoff's project and runtime defaults come from.
 *
 * Both trackers already store a per-scope mapping — Crane by team key, Jira by
 * project key — but they store it in different settings blocks with different
 * field names. Resolving that here keeps the kickoff sheet from carrying a
 * branch per source, and keeps the fallback order in one testable place.
 */

const MAX_REPOSITORY_MAPPINGS = 100;
const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]{0,63})-\d+$/;

/**
 * The mapping scope a ticket belongs to.
 *
 * Crane reuses its own team-key parser so a rule change there cannot drift from
 * this one; Jira keys are `PROJECT-123`, and the project key is the part a
 * mapping row is filed under.
 */
export function resolveTrackerIssueScopeKey(task: TrackerIssue): string | null {
  if (task.source === "crane") {
    return getCraneTeamKey(task.key);
  }
  const match = ISSUE_KEY_PATTERN.exec(task.key.trim());
  return match?.[1] ? match[1].toUpperCase() : null;
}

/** Human label for the "Remember for ..." switch. */
export function describeTrackerIssueScope(task: TrackerIssue): string | null {
  const key = resolveTrackerIssueScopeKey(task);
  return key ? key : null;
}

export interface TrackerIssueMappingSettings {
  craneMappings: readonly CraneRepositoryMapping[];
  jiraMappings: readonly JiraProjectMapping[];
}

function findJiraMapping(
  task: TrackerIssue,
  mappings: readonly JiraProjectMapping[],
) {
  const scope = resolveTrackerIssueScopeKey(task);
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
export function findTrackerIssueMappedRepositoryPath(args: {
  task: TrackerIssue;
  settings: TrackerIssueMappingSettings;
  registeredRepositoryPaths: readonly string[];
}): string | null {
  if (args.task.source === "crane") {
    return findMappedStaveRepositoryPath({
      issueKey: args.task.key,
      mappings: args.settings.craneMappings,
      registeredRepositoryPaths: args.registeredRepositoryPaths,
    });
  }
  const mapping = findJiraMapping(args.task, args.settings.jiraMappings);
  if (!mapping) {
    return null;
  }
  return args.registeredRepositoryPaths.includes(mapping.staveProjectPath)
    ? mapping.staveProjectPath
    : null;
}

/** The model/effort setup last remembered for this ticket's scope, if any. */
export function findTrackerIssueRuntimeMemory(args: {
  task: TrackerIssue;
  settings: TrackerIssueMappingSettings;
}): CraneTeamRuntimeMemory | null {
  if (args.task.source === "crane") {
    return findMappedCraneTeamRuntime({
      issueKey: args.task.key,
      mappings: args.settings.craneMappings,
    });
  }
  return (
    findJiraMapping(args.task, args.settings.jiraMappings)?.runtime ?? null
  );
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
  ].slice(0, MAX_REPOSITORY_MAPPINGS);
}

export { updateCraneTeamRepositoryMapping as updateCraneTeamProjectMapping };

/**
 * Last project a kickoff actually used, per source.
 *
 * `localStorage` rather than settings: it is a convenience default that costs
 * one click when lost, and syncing it would put a machine-local path into an
 * exportable settings document.
 */
export const TRACKER_ISSUES_LAST_REPOSITORY_STORAGE_KEY =
  "stave.tracker-issues.last-project";

export function parseTrackerIssueLastRepositories(
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
  for (const source of TRACKER_SOURCE_IDS) {
    const value = (decoded as Record<string, unknown>)[source];
    if (typeof value === "string" && value.trim().length > 0) {
      result[source] = value;
    }
  }
  return result;
}

export function readTrackerIssueLastRepository(
  source: TrackerSourceId,
): string | null {
  try {
    return (
      parseTrackerIssueLastRepositories(
        globalThis.localStorage?.getItem(
          TRACKER_ISSUES_LAST_REPOSITORY_STORAGE_KEY,
        ) ?? null,
      )[source] ?? null
    );
  } catch {
    return null;
  }
}

export function writeTrackerIssueLastRepository(
  source: TrackerSourceId,
  repositoryPath: string,
): void {
  try {
    const current = parseTrackerIssueLastRepositories(
      globalThis.localStorage?.getItem(
        TRACKER_ISSUES_LAST_REPOSITORY_STORAGE_KEY,
      ) ?? null,
    );
    globalThis.localStorage?.setItem(
      TRACKER_ISSUES_LAST_REPOSITORY_STORAGE_KEY,
      JSON.stringify({ ...current, [source]: repositoryPath }),
    );
  } catch {
    // A convenience default is not worth surfacing a storage failure for.
  }
}
