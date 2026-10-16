/** Explicit runtime ownership only; never infer task ownership from command text. */
export interface ResourceProcessOwner {
  workspaceId: string;
  taskId?: string;
  taskTitle?: string;
  active: boolean;
}

type OwnerEntry = ResourceProcessOwner & { users: number; releasedSeq: number };

/**
 * A long-lived process (such as a shared provider server) serves many tasks.
 * Released owners stay visible as "retained after task", but only the most
 * recently released ones per process.
 */
const MAX_INACTIVE_OWNERS_PER_PROCESS = 20;

const ownersByPid = new Map<number, Map<string, OwnerEntry>>();
let releaseSeq = 0;

function trimInactiveOwners(owners: Map<string, OwnerEntry>) {
  const inactive = [...owners].filter(([, entry]) => !entry.active);
  if (inactive.length <= MAX_INACTIVE_OWNERS_PER_PROCESS) return;
  inactive
    .sort(([, a], [, b]) => a.releasedSeq - b.releasedSeq)
    .slice(0, inactive.length - MAX_INACTIVE_OWNERS_PER_PROCESS)
    .forEach(([key]) => owners.delete(key));
}

export function retainResourceProcessOwner(pid: number, owner: { workspaceId?: string; taskId?: string }): () => void {
  if (!owner.workspaceId || pid <= 0) return () => {};
  const owners = ownersByPid.get(pid) ?? new Map<string, OwnerEntry>();
  ownersByPid.set(pid, owners);
  const key = JSON.stringify([owner.workspaceId, owner.taskId]);
  const entry = owners.get(key) ?? { workspaceId: owner.workspaceId, taskId: owner.taskId, active: false, users: 0, releasedSeq: 0 };
  entry.users += 1;
  entry.active = true;
  owners.set(key, entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.users -= 1;
    entry.active = entry.users > 0;
    if (entry.active) return;
    entry.releasedSeq = ++releaseSeq;
    trimInactiveOwners(owners);
  };
}

export function forgetResourceProcess(pid: number) {
  ownersByPid.delete(pid);
}

export function getResourceProcessOwners(): Map<number, ResourceProcessOwner[]> {
  return new Map([...ownersByPid].map(([pid, owners]) => [pid, [...owners.values()].map(({ users: _users, releasedSeq: _releasedSeq, ...owner }) => owner)]));
}
