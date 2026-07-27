import type { CraneProjectMapping, CraneTeamRuntimeMemory } from "./types";

const CRANE_TEAM_KEY_PATTERN = /^([a-z][a-z0-9_-]{0,63})-\d+$/i;
const MAX_PROJECT_MAPPINGS = 100;

function normalizeTeamKey(value: string) {
  return value.trim().toUpperCase();
}

export function getCraneTeamKey(issueKey: string) {
  const match = issueKey.trim().match(CRANE_TEAM_KEY_PATTERN);
  return match?.[1] ? normalizeTeamKey(match[1]) : null;
}

export function findMappedStaveProjectPath(args: {
  issueKey: string;
  mappings: readonly CraneProjectMapping[];
  registeredProjectPaths: readonly string[];
}) {
  const teamKey = getCraneTeamKey(args.issueKey);
  if (!teamKey) {
    return null;
  }
  const registeredPaths = new Set(args.registeredProjectPaths);
  return (
    args.mappings.find(
      (mapping) =>
        mapping.craneTeamKey &&
        normalizeTeamKey(mapping.craneTeamKey) === teamKey &&
        registeredPaths.has(mapping.staveProjectPath),
    )?.staveProjectPath ?? null
  );
}

/**
 * The model/effort setup last approved for this Crane team, if any. Access
 * levels are intentionally not remembered - see `CraneTeamRuntimeMemorySchema`.
 */
export function findMappedCraneTeamRuntime(args: {
  issueKey: string;
  mappings: readonly CraneProjectMapping[];
}): CraneTeamRuntimeMemory | null {
  const teamKey = getCraneTeamKey(args.issueKey);
  if (!teamKey) {
    return null;
  }
  return (
    args.mappings.find(
      (mapping) =>
        mapping.craneTeamKey &&
        normalizeTeamKey(mapping.craneTeamKey) === teamKey,
    )?.runtime ?? null
  );
}

export function updateCraneTeamProjectMapping(args: {
  mappings: readonly CraneProjectMapping[];
  teamKey: string;
  staveProjectPath: string | null;
  runtime?: CraneTeamRuntimeMemory | null;
}): CraneProjectMapping[] {
  const teamKey = normalizeTeamKey(args.teamKey);
  const withoutTeamMapping = args.mappings.filter(
    (mapping) =>
      !mapping.craneTeamKey ||
      normalizeTeamKey(mapping.craneTeamKey) !== teamKey,
  );
  const staveProjectPath = args.staveProjectPath?.trim() || null;
  if (!staveProjectPath) {
    return withoutTeamMapping;
  }
  return [
    {
      craneTeamKey: teamKey,
      staveProjectPath,
      ...(args.runtime ? { runtime: args.runtime } : {}),
    },
    ...withoutTeamMapping,
  ].slice(0, MAX_PROJECT_MAPPINGS);
}
