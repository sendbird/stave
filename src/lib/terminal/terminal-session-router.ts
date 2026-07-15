import { TerminalTranscriptBuffer } from "./transcript-buffer";

const TERMINAL_ROUTER_BUFFER_MAX_CHARS = 2_000_000;

export interface TerminalSessionExitInfo {
  exitCode: number;
  signal?: number;
}

export interface TerminalSessionSubscriberCallbacks {
  onOutput: (data: string, onParsed?: () => void) => void;
  onScreenState: (screenState: string) => void;
  onExit?: (info: TerminalSessionExitInfo) => void;
}

interface SessionState {
  subscribers: Map<number, TerminalSessionSubscriberCallbacks>;
  screenState: string | null;
  bufferedOutput: TerminalTranscriptBuffer;
  bufferedOutputAcks: Array<() => void>;
  exitInfo: TerminalSessionExitInfo | null;
}

let nextSubscriberId = 1;

export class TerminalSessionRouter {
  private readonly sessions = new Map<string, SessionState>();

  private getOrCreateSession(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        subscribers: new Map(),
        screenState: null,
        bufferedOutput: new TerminalTranscriptBuffer(
          TERMINAL_ROUTER_BUFFER_MAX_CHARS,
        ),
        bufferedOutputAcks: [],
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
      if (currentSession.bufferedOutput.size > 0) {
        const bufferedAcks = currentSession.bufferedOutputAcks.splice(0);
        // This replay is delivered only to the subscriber whose registration
        // microtask is running. Other subscribers have their own replay
        // callback, so counting the whole map here could strand the ACK when
        // two surfaces subscribe in the same turn.
        let remainingSubscribers = 1;
        const onParsed = () => {
          remainingSubscribers -= 1;
          if (remainingSubscribers <= 0) {
            for (const ack of bufferedAcks) {
              ack();
            }
          }
        };
        currentCallbacks.onOutput(
          currentSession.bufferedOutput.toString(),
          onParsed,
        );
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
      session.bufferedOutput.clear();
      for (const ack of session.bufferedOutputAcks.splice(0)) {
        ack();
      }
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

    session.bufferedOutput.append(args.backlog);
  }

  publishOutput(sessionId: string, output: string, onParsed?: () => void) {
    if (!output) {
      return;
    }

    const session = this.getOrCreateSession(sessionId);
    if (session.subscribers.size > 0) {
      let remainingSubscribers = session.subscribers.size;
      for (const callbacks of session.subscribers.values()) {
        callbacks.onOutput(output, () => {
          remainingSubscribers -= 1;
          if (remainingSubscribers <= 0) {
            onParsed?.();
          }
        });
      }
      return;
    }

    session.bufferedOutput.append(output);
    if (onParsed) {
      session.bufferedOutputAcks.push(onParsed);
    }
  }

  publishExit(sessionId: string, info: TerminalSessionExitInfo) {
    const session = this.getOrCreateSession(sessionId);
    session.exitInfo = info;
    for (const callbacks of session.subscribers.values()) {
      callbacks.onExit?.(info);
    }
  }

  clearSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    for (const ack of session?.bufferedOutputAcks.splice(0) ?? []) {
      ack();
    }
    this.sessions.delete(sessionId);
  }

  clearAll() {
    for (const session of this.sessions.values()) {
      for (const ack of session.bufferedOutputAcks) {
        ack();
      }
    }
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
