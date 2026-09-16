/** Explicit runtime ownership only; never infer task ownership from command text. */
export interface ResourceProcessOwner {
  workspaceId: string;
  taskId?: string;
  taskTitle?: string;
  active: boolean;
}

const ownersByPid = new Map<number, Map<string, ResourceProcessOwner & { users: number }>>();

export function retainResourceProcessOwner(pid: number, owner: { workspaceId?: string; taskId?: string }): () => void {
  if (!owner.workspaceId || pid <= 0) return () => {};
  const owners = ownersByPid.get(pid) ?? new Map();
  ownersByPid.set(pid, owners);
  const key = JSON.stringify([owner.workspaceId, owner.taskId]);
  const entry = owners.get(key) ?? { workspaceId: owner.workspaceId, taskId: owner.taskId, active: false, users: 0 };
  entry.users += 1;
  entry.active = true;
  owners.set(key, entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.users -= 1;
    entry.active = entry.users > 0;
  };
}

export function forgetResourceProcess(pid: number) {
  ownersByPid.delete(pid);
}

export function getResourceProcessOwners(): Map<number, ResourceProcessOwner[]> {
  return new Map([...ownersByPid].map(([pid, owners]) => [pid, [...owners.values()].map(({ users: _users, ...owner }) => owner)]));
}
