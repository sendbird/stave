/** One inexpensive read at a time; invalidated responses never reach the shelf. */
export function createArchivedShelfRefresh<T>(read: () => Promise<T>, publish: (value: T) => void) {
  let generation = 0;
  let pending: Promise<void> | null = null;
  return {
    invalidate() { generation++; pending = null; },
    run(): Promise<void> {
      if (pending) return pending;
      const token = generation;
      const request = read().then(value => { if (token === generation) publish(value); }).catch(() => {}).finally(() => { if (pending === request) pending = null; });
      pending = request;
      return request;
    },
  };
}
