/**
 * Mission grants: which stage attempt a mission turn may report for.
 *
 * `runtime.ts` registers a grant when it starts a turn that carries a
 * `missionStage`, and revokes it when the turn ends. The stage-reporting tools
 * reach the host with the grant's key, and the mission runtime resolves the
 * mission, stage and attempt from it here. The model never passes them, so it
 * cannot report for another stage, and a key whose turn ended resolves to
 * nothing.
 *
 * Lives in the host service process, beside the advisor and worker grant
 * registries, because that is where turns start.
 */
import type { MissionStageIdentity } from "../../src/lib/missions/domain";

export interface MissionStageGrant extends MissionStageIdentity {
  turnId: string;
  taskId: string;
}

const grantsByKey = new Map<string, MissionStageGrant>();

export function registerMissionGrant(
  args: MissionStageGrant & { missionKey: string },
) {
  const { missionKey, ...grant } = args;
  grantsByKey.set(missionKey, grant);
  return {
    revoke() {
      // A reused channel key may already carry a newer turn's grant.
      if (grantsByKey.get(missionKey) === grant) grantsByKey.delete(missionKey);
    },
  };
}

/** The active grant for a key, or null once its turn has ended. */
export function resolveMissionGrant(missionKey: string): MissionStageGrant | null {
  const key = missionKey.trim();
  return key ? (grantsByKey.get(key) ?? null) : null;
}

export function clearMissionGrantsForTest() {
  grantsByKey.clear();
}
