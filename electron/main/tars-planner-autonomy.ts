import {
  TARS_ACTION_KEYS, matchTarsNeverRules, tarsActionDisposition, tarsRepositoryName,
  type TarsActionOrigin, type TarsAutonomyLevel, type TarsAllowRule,
} from "../../src/lib/tars/autonomy";

/** Global defaults and repository overrides use the host's policy, including matched never-do rules. */
export function tarsPlannerAutonomy(level: TarsAutonomyLevel, origin: TarsActionOrigin,
  guard?: { allowRules?: readonly TarsAllowRule[]; neverDo: readonly string[] }) {
  const allowRules = guard?.allowRules ?? [];
  const policy = (repositoryPath: string | null) => {
    const mode = (key: (typeof TARS_ACTION_KEYS)[number]) => tarsActionDisposition({ key, level, origin,
      context: { allowRules, repositoryPath }, matches: matchTarsNeverRules(guard?.neverDo, { key, repository: tarsRepositoryName(repositoryPath) }) });
    return { appliesAtOnce: TARS_ACTION_KEYS.filter((key) => mode(key) === "auto"), waitsForConfirm: TARS_ACTION_KEYS.filter((key) => mode(key) === "confirm") };
  };
  return { ...policy(null), repositoryPolicies: [...new Set(allowRules.flatMap((rule) => rule.repositoryPath ? [rule.repositoryPath] : []))]
    .map((repositoryPath) => ({ repositoryPath, ...policy(repositoryPath) })) };
}
