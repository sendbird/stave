const failedKeys = new Set<string>();
const listeners = new Set<() => void>();

export function setWorkspaceSaveFailure(key: string, failed: boolean) {
  const before = failedKeys.size;
  if (failed) failedKeys.add(key);
  else failedKeys.delete(key);
  if (before !== failedKeys.size) {
    for (const listener of listeners) listener();
  }
}

export const workspaceSaveStatus = {
  getSnapshot: () => failedKeys.size,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
