const TERMINAL_ROUTER_BUFFER_MAX_CHARS = 2_000_000;

export interface TerminalSessionExitInfo {
  exitCode: number;
  signal?: number;
}

export interface TerminalSessionSubscriberCallbacks {
  onOutput: (data: string) => void;
  onScreenState: (screenState: string) => void;
  onExit?: (info: TerminalSessionExitInfo) => void;
}

interface SessionState {
  subscribers: Map<number, TerminalSessionSubscriberCallbacks>;
  screenState: string | null;
  bufferedOutput: string;
  exitInfo: TerminalSessionExitInfo | null;
}

let nextSubscriberId = 1;

function appendBoundedOutput(existing: string, next: string) {
  if (!next) {
    return existing;
  }

  const combined = `${existing}${next}`;
  if (combined.length <= TERMINAL_ROUTER_BUFFER_MAX_CHARS) {
    return combined;
  }

  return combined.slice(-TERMINAL_ROUTER_BUFFER_MAX_CHARS);
}

export class TerminalSessionRouter {
  private readonly sessions = new Map<string, SessionState>();

  private getOrCreateSession(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        subscribers: new Map(),
        screenState: null,
        bufferedOutput: "",
        exitInfo: null,
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  subscribe(
    sessionId: string,
    callbacks: TerminalSessionSubscriberCallbacks,
  ): () => void {
    const session = this.getOrCreateSession(sessionId);
    const subscriberId = nextSubscriberId++;
    session.subscribers.set(subscriberId, callbacks);

    queueMicrotask(() => {
      const currentSession = this.sessions.get(sessionId);
      const currentCallbacks = currentSession?.subscribers.get(subscriberId);
      if (!currentSession || !currentCallbacks) {
        return;
      }

      if (currentSession.screenState !== null) {
        currentCallbacks.onScreenState(currentSession.screenState);
      }
      if (currentSession.bufferedOutput) {
        currentCallbacks.onOutput(currentSession.bufferedOutput);
      }
      if (currentSession.exitInfo) {
        currentCallbacks.onExit?.(currentSession.exitInfo);
      }
    });

    return () => {
      const currentSession = this.sessions.get(sessionId);
      if (!currentSession) {
        return;
      }
      currentSession.subscribers.delete(subscriberId);
    };
  }

  publishSnapshot(args: {
    sessionId: string;
    screenState?: string;
    backlog?: string;
  }) {
    const session = this.getOrCreateSession(args.sessionId);

    if (typeof args.screenState === "string") {
      session.screenState = args.screenState;
      session.bufferedOutput = "";
      for (const callbacks of session.subscribers.values()) {
        callbacks.onScreenState(args.screenState);
      }
      return;
    }

    if (!args.backlog) {
      return;
    }

    if (session.subscribers.size > 0) {
      for (const callbacks of session.subscribers.values()) {
        callbacks.onOutput(args.backlog);
      }
      return;
    }

    session.bufferedOutput = appendBoundedOutput(
      session.bufferedOutput,
      args.backlog,
    );
  }

  publishOutput(sessionId: string, output: string) {
    if (!output) {
      return;
    }

    const session = this.getOrCreateSession(sessionId);
    if (session.subscribers.size > 0) {
      for (const callbacks of session.subscribers.values()) {
        callbacks.onOutput(output);
      }
      return;
    }

    session.bufferedOutput = appendBoundedOutput(session.bufferedOutput, output);
  }

  publishExit(sessionId: string, info: TerminalSessionExitInfo) {
    const session = this.getOrCreateSession(sessionId);
    session.exitInfo = info;
    for (const callbacks of session.subscribers.values()) {
      callbacks.onExit?.(info);
    }
  }

  clearSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  clearAll() {
    this.sessions.clear();
  }
}

let terminalSessionRouterSingleton: TerminalSessionRouter | null = null;

export function getTerminalSessionRouter() {
  if (!terminalSessionRouterSingleton) {
    terminalSessionRouterSingleton = new TerminalSessionRouter();
  }
  return terminalSessionRouterSingleton;
}
