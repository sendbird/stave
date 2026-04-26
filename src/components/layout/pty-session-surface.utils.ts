export function shouldCreatePtySession(args: {
  isVisible: boolean;
  workspaceId: string;
  hasActiveTab: boolean;
}) {
  return args.isVisible && args.hasActiveTab && Boolean(args.workspaceId);
}

export function createLatestAsyncDispatcher<T>(args: {
  run: (value: T) => Promise<void>;
  onError?: (error: unknown, value: T) => void;
}) {
  let inFlight = false;
  let pending: T | null = null;
  let idleResolvers: Array<() => void> = [];

  const resolveIdle = () => {
    if (inFlight || pending !== null || idleResolvers.length === 0) {
      return;
    }

    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  };

  const flush = () => {
    if (inFlight || pending === null) {
      resolveIdle();
      return;
    }

    const next = pending;
    pending = null;
    inFlight = true;

    void args.run(next)
      .catch((error) => {
        args.onError?.(error, next);
      })
      .finally(() => {
        inFlight = false;
        flush();
      });
  };

  return {
    schedule(value: T) {
      pending = value;
      const whenIdle = new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });
      flush();
      return whenIdle;
    },
    clear() {
      pending = null;
      resolveIdle();
    },
  };
}
